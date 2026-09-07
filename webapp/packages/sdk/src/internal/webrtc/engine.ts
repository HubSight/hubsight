import { HubSightMediaError } from '../../errors';
import type {
  CreateLiveStreamOptions,
  LiveStreamState,
  LiveStreamStats,
  Unsubscribe,
} from '../../media/types';
import type { InternalHttpClient } from '../http/types';
import { createStatsPoller, type StatsPoller } from './stats';

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' },
];

export interface WebRtcEngineOptions extends CreateLiveStreamOptions {
  http: InternalHttpClient;
}

export class InternalWebRtcEngine {
  readonly cameraId: string;

  private readonly http: InternalHttpClient;
  private readonly jitterBufferMs: number;
  private readonly heartbeatMs: number;
  private readonly iceGatherTimeoutMs: number;
  private readonly statsIntervalMs: number;

  private state: LiveStreamState = 'idle';
  private pc: RTCPeerConnection | null = null;
  private mediaStream: MediaStream;
  private videoElement: HTMLVideoElement | null = null;
  private poolStreamName: string | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private statsPoller: StatsPoller | null = null;
  private active = true;
  private audioTrackPresent = false;

  private readonly stateListeners = new Set<(state: LiveStreamState) => void>();
  private readonly statsListeners = new Set<(stats: LiveStreamStats) => void>();
  private readonly errorListeners = new Set<(err: Error) => void>();
  private readonly audioTrackListeners = new Set<() => void>();

  constructor(options: WebRtcEngineOptions) {
    this.cameraId = options.cameraId;
    this.http = options.http;
    this.jitterBufferMs = options.jitterBufferMs ?? 800;
    this.heartbeatMs = options.heartbeatMs ?? 15_000;
    this.iceGatherTimeoutMs = options.iceGatherTimeoutMs ?? 400;
    this.statsIntervalMs = options.statsIntervalMs ?? 1000;

    this.mediaStream = new MediaStream();

    if (options.onStatus) this.stateListeners.add(options.onStatus);
    if (options.onStats) this.statsListeners.add(options.onStats);
    if (options.onError) this.errorListeners.add(options.onError);
    if (options.onAudioTrack) this.audioTrackListeners.add(options.onAudioTrack);

    if (options.video) {
      this.attach(options.video);
    }
  }

  getState(): LiveStreamState {
    return this.state;
  }

  hasAudio(): boolean {
    return this.audioTrackPresent;
  }

  attach(video: HTMLVideoElement): void {
    this.videoElement = video;
    video.srcObject = this.mediaStream;
    if (this.state === 'live') {
      video.play().catch(() => { });
    }
  }

  detach(): void {
    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }
  }

  setMuted(muted: boolean): void {
    if (this.videoElement) {
      this.videoElement.muted = muted;
    }
  }

  setVolume(volume: number): void {
    if (this.videoElement) {
      this.videoElement.volume = Math.max(0, Math.min(1, volume));
    }
  }

  onStateChange(listener: (state: LiveStreamState) => void): Unsubscribe {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onStats(listener: (stats: LiveStreamStats) => void): Unsubscribe {
    this.statsListeners.add(listener);
    return () => this.statsListeners.delete(listener);
  }

  onError(listener: (err: Error) => void): Unsubscribe {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  async start(): Promise<void> {
    if (typeof RTCPeerConnection === 'undefined') {
      this.fail(new HubSightMediaError('WebRTC is not supported in this environment'));
      return;
    }

    this.setState('connecting');

    try {
      this.pc = new RTCPeerConnection({
        iceServers: DEFAULT_ICE_SERVERS,
        bundlePolicy: 'max-bundle',
      });

      this.setupTracks();
      await this.negotiate();
      this.startHeartbeat();
    } catch (err) {
      this.fail(err);
    }
  }

  private setState(next: LiveStreamState): void {
    if (this.state === next) return;
    this.state = next;
    for (const l of this.stateListeners) {
      try {
        l(next);
      } catch {
        /* ignore */
      }
    }
  }

  private fail(err: unknown): void {
    if (!this.active) return;
    const error =
      err instanceof Error ? err : new HubSightMediaError(String(err));
    this.setState('error');
    for (const l of this.errorListeners) {
      try {
        l(error);
      } catch {
        /* ignore */
      }
    }
  }

  private setupTracks(): void {
    if (!this.pc) return;

    this.pc.addTransceiver('video', { direction: 'recvonly' });
    this.pc.addTransceiver('audio', { direction: 'recvonly' });

    const attachTrack = (track: MediaStreamTrack) => {
      if (!this.mediaStream.getTracks().includes(track)) {
        this.mediaStream.addTrack(track);
      }
    };

    const applyJitterBuffer = (receiver: RTCRtpReceiver) => {
      if (this.jitterBufferMs <= 0) return;
      try {
        (receiver as RTCRtpReceiver & { jitterBufferTarget?: number }).jitterBufferTarget =
          this.jitterBufferMs;
      } catch {
        /* ignore legacy browser unsupported */
      }
    };

    const handleTrack = (track: MediaStreamTrack) => {
      if (track.kind === 'audio') {
        this.audioTrackPresent = true;
        for (const l of this.audioTrackListeners) {
          try {
            l();
          } catch {
            /* ignore */
          }
        }
        if (!track.muted) {
          attachTrack(track);
          return;
        }
        track.addEventListener('unmute', () => attachTrack(track), { once: true });
        return;
      }
      attachTrack(track);
    };

    this.pc.ontrack = (event) => {
      if (!this.active) return;
      if (event.receiver) applyJitterBuffer(event.receiver);
      if (event.track) handleTrack(event.track);
      event.streams?.[0]?.getTracks().forEach(handleTrack);

      this.setState('live');
      if (this.videoElement) {
        this.videoElement.play().catch(() => { });
      }

      if (this.statsIntervalMs > 0 && this.pc && this.videoElement && !this.statsPoller) {
        this.statsPoller = createStatsPoller(
          this.pc,
          this.videoElement,
          (stats) => {
            for (const l of this.statsListeners) {
              try {
                l(stats);
              } catch {
                /* ignore */
              }
            }
          },
          this.statsIntervalMs,
        );
      }
    };
  }

  private async negotiate(): Promise<void> {
    if (!this.pc) return;

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    if (this.pc.iceGatheringState !== 'complete') {
      await new Promise<void>((resolve) => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        const check = () => {
          if (this.pc?.iceGatheringState === 'complete') {
            if (timer) clearTimeout(timer);
            this.pc?.removeEventListener('icegatheringstatechange', check);
            resolve();
          }
        };
        timer = setTimeout(() => {
          this.pc?.removeEventListener('icegatheringstatechange', check);
          resolve();
        }, this.iceGatherTimeoutMs);
        this.pc?.addEventListener('icegatheringstatechange', check);
      });
    }

    const sdpOffer = this.pc.localDescription?.sdp;
    if (!sdpOffer) {
      throw new HubSightMediaError('Failed to generate local SDP offer');
    }

    const res = await this.http.requestRaw(`/live/${this.cameraId}/webrtc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp' },
      body: sdpOffer,
    });

    if (!res.ok) {
      throw new HubSightMediaError(`Signaling failed with status ${res.status}`);
    }

    const sdpAnswer = await res.text();
    this.poolStreamName = res.headers['x-pool-stream-name'] ?? null;

    if (!this.pc || !this.active) return;
    await this.pc.setRemoteDescription({ type: 'answer', sdp: sdpAnswer });
  }

  private startHeartbeat(): void {
    if (this.heartbeatMs <= 0) return;
    this.heartbeatTimer = setInterval(() => {
      if (!this.poolStreamName || !this.active) return;
      this.http
        .post(`/live/${this.cameraId}/heartbeat`, null, {
          params: { stream_name: this.poolStreamName },
        })
        .catch(() => { });
    }, this.heartbeatMs);
  }

  private releasePoolLease(): void {
    if (!this.poolStreamName) return;
    const name = this.poolStreamName;
    this.poolStreamName = null;

    this.http
      .requestRaw(`/live/${this.cameraId}/release`, {
        method: 'POST',
        params: { stream_name: name },
        keepalive: true,
      })
      .catch(() => { });
  }

  async destroy(): Promise<void> {
    if (!this.active) return;
    this.active = false;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.statsPoller) {
      this.statsPoller.stop();
      this.statsPoller = null;
    }

    this.releasePoolLease();

    if (this.pc) {
      try {
        this.pc.close();
      } catch {
        /* ignore */
      }
      this.pc = null;
    }

    this.mediaStream.getTracks().forEach((track) => track.stop());
    this.detach();

    this.setState('closed');
    this.stateListeners.clear();
    this.statsListeners.clear();
    this.errorListeners.clear();
    this.audioTrackListeners.clear();
  }
}

