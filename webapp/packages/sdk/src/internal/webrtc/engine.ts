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

// Non-trickle signaling: candidates gathered after the offer is sent are never
// delivered (single one-shot SDP exchange, see negotiate()). Firefox's ICE
// agent is disproportionately slower than Chromium's to produce its
// server-reflexive candidate behind NAT, so a short gather budget silently
// drops exactly the candidate needed to punch through to a public media-server host
// — this shows up as a Firefox-only black screen / failed connection.
const DEFAULT_ICE_GATHER_TIMEOUT_MS = 4000;

// A transient 'disconnected' state (brief packet loss, network hiccup) often
// self-recovers without renegotiation — only treat it as terminal after this
// grace period with no recovery.
const DISCONNECT_GRACE_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 8000;

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
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disconnectGraceTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly stateListeners = new Set<(state: LiveStreamState) => void>();
  private readonly statsListeners = new Set<(stats: LiveStreamStats) => void>();
  private readonly errorListeners = new Set<(err: Error) => void>();
  private readonly audioTrackListeners = new Set<() => void>();

  constructor(options: WebRtcEngineOptions) {
    this.cameraId = options.cameraId;
    this.http = options.http;
    this.jitterBufferMs = options.jitterBufferMs ?? 800;
    this.heartbeatMs = options.heartbeatMs ?? 15_000;
    this.iceGatherTimeoutMs = options.iceGatherTimeoutMs ?? DEFAULT_ICE_GATHER_TIMEOUT_MS;
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
    if (this.mediaStream.getTracks().length > 0) {
      video.srcObject = this.mediaStream;
    }
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

      this.pc.onconnectionstatechange = () => {
        const state = this.pc?.connectionState;
        if (state === 'connected') {
          this.reconnectAttempts = 0;
          this.clearDisconnectGraceTimer();
        } else if (state === 'failed') {
          this.clearDisconnectGraceTimer();
          this.scheduleReconnect();
        } else if (state === 'disconnected') {
          // Give it a grace window to self-recover before tearing down.
          if (!this.disconnectGraceTimer) {
            this.disconnectGraceTimer = setTimeout(() => {
              this.disconnectGraceTimer = null;
              if (this.pc?.connectionState === 'disconnected') {
                this.scheduleReconnect();
              }
            }, DISCONNECT_GRACE_MS);
          }
        }
      };

      this.setupTracks();
      await this.negotiate();
      this.startHeartbeat();
    } catch (err) {
      if (this.active && this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        this.scheduleReconnect();
      } else {
        this.fail(err);
      }
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

  private clearDisconnectGraceTimer(): void {
    if (this.disconnectGraceTimer) {
      clearTimeout(this.disconnectGraceTimer);
      this.disconnectGraceTimer = null;
    }
  }

  /**
   * Auto-recover from a dropped connection instead of dead-ending in 'error'
   * (previously the only path on Firefox, whose ICE agent is more prone to
   * transient disconnects on marginal NAT paths). Retries with exponential
   * backoff, then surfaces a terminal error once attempts are exhausted.
   */
  private scheduleReconnect(): void {
    if (!this.active || this.reconnectTimer) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.fail(new HubSightMediaError('WebRTC reconnect attempts exhausted'));
      return;
    }
    this.reconnectAttempts += 1;
    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * 2 ** (this.reconnectAttempts - 1),
      RECONNECT_MAX_DELAY_MS,
    );
    this.setState('connecting');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.restart();
    }, delay);
  }

  private teardownPeerConnection(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.statsPoller) {
      this.statsPoller.stop();
      this.statsPoller = null;
    }
    if (this.pc) {
      try {
        this.pc.close();
      } catch {
        /* ignore */
      }
      this.pc = null;
    }
    this.mediaStream.getTracks().forEach((track) => track.stop());
    this.mediaStream = new MediaStream();
    if (this.videoElement) this.videoElement.srcObject = null;
    this.audioTrackPresent = false;
  }

  private async restart(): Promise<void> {
    if (!this.active) return;
    this.teardownPeerConnection();
    this.releasePoolLease();
    await this.start();
  }

  private setupTracks(): void {
    if (!this.pc) return;

    this.pc.addTransceiver('video', { direction: 'recvonly' });
    this.pc.addTransceiver('audio', { direction: 'recvonly' });

    const attachTrack = (track: MediaStreamTrack) => {
      if (!this.mediaStream.getTracks().includes(track)) {
        this.mediaStream.addTrack(track);
      }
      if (this.videoElement && this.videoElement.srcObject !== this.mediaStream) {
        this.videoElement.srcObject = this.mediaStream;
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
      // Video track: attach immediately
      attachTrack(track);
    };

    this.pc.ontrack = (event) => {
      if (!this.active) return;
      if (event.receiver) applyJitterBuffer(event.receiver);
      if (event.track) handleTrack(event.track);

      // Dedicated stream: keep silent/unbuffered audio track OUT of <video>
      // Attaching an audio track with no incoming packets stalls Firefox and Chrome video playback on A/V sync.
      if (this.videoElement) {
        if (this.videoElement.srcObject !== this.mediaStream && this.mediaStream.getTracks().length > 0) {
          this.videoElement.srcObject = this.mediaStream;
        }
        this.videoElement.play().catch(() => { });
      }

      this.setState('live');

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
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.clearDisconnectGraceTimer();
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

