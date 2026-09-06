import { resolveApiBase } from './config';
import { createStatsPoller } from './stats';
import { EMPTY_LIVE_STATS, type LiveStats, type LiveStatus } from './types';

/** A `fetch`-compatible function. Defaults to `globalThis.fetch` with credentials. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface LiveStreamOptions {
  cameraId: string;
  /** The `<video>` element to render into. The SDK sets `srcObject` and calls `play()`. */
  video: HTMLVideoElement;
  /** REST API base (e.g. `/api`). */
  baseUrl?: string;
  /**
   * Playout jitter buffer target in ms, applied to the video `RTCRtpReceiver`.
   * Default 800. `0` disables. Raise (1500-2500) for lossy WAN cameras.
   */
  jitterBufferMs?: number;
  /** ICE servers. Defaults to Cloudflare + Google STUN, no TURN. */
  iceServers?: RTCIceServer[];
  /** Heartbeat cadence for the pool lease. Default 15000. */
  heartbeatMs?: number;
  /** Max time to wait for ICE gathering before sending the offer. Default 400. */
  iceGatherTimeoutMs?: number;
  /** Custom fetch (e.g. an axios-backed one that refreshes on 401). Default: `fetch` + credentials. */
  fetch?: FetchLike;
  /** How often to sample `getStats()`. Default 1000. `0` disables stats. */
  statsIntervalMs?: number;

  onStatus?: (status: LiveStatus) => void;
  onStats?: (stats: LiveStats) => void;
  onError?: (error: Error) => void;
  /** Fired once when an audio track is present on the connection (may still be silent). */
  onAudioTrack?: () => void;
}

export interface LiveStreamHandle {
  readonly cameraId: string;
  readonly pc: RTCPeerConnection;
  status(): LiveStatus;
  /** The pool connection id the server assigned (`X-Pool-Stream-Name`), once negotiated. */
  poolStreamName(): string | null;
  close(): void;
}

const DEFAULT_ICE: RTCIceServer[] = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' },
];

function defaultFetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(input, { credentials: 'include', ...init });
}

/**
 * Open a WebRTC live view for one camera. Reproduces the old `LivePlayer` flow:
 * recvonly video+audio, silent-audio-track gating, `jitterBufferTarget`, 400ms
 * ICE-gather cap, `POST {base}/live/:id/webrtc` (application/sdp), `X-Pool-Stream-Name`
 * capture, 15s heartbeat, keepalive release on `close()`.
 */
export function startLiveStream(options: LiveStreamOptions): LiveStreamHandle {
  const {
    cameraId,
    video,
    jitterBufferMs = 800,
    iceServers = DEFAULT_ICE,
    heartbeatMs = 15_000,
    iceGatherTimeoutMs = 400,
    statsIntervalMs = 1000,
    onStatus,
    onStats,
    onError,
    onAudioTrack,
  } = options;

  const base = resolveApiBase(options.baseUrl);
  const doFetch = options.fetch ?? defaultFetch;

  let status: LiveStatus = 'idle';
  let poolStreamName: string | null = null;
  let active = true;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let statsPoller: { stop(): void } | null = null;

  const pc = new RTCPeerConnection({ iceServers, bundlePolicy: 'max-bundle' });

  const setStatus = (s: LiveStatus) => {
    if (status === s) return;
    status = s;
    onStatus?.(s);
  };

  const fail = (err: unknown) => {
    if (!active) return;
    const e = err instanceof Error ? err : new Error(String(err));
    setStatus('error');
    onError?.(e);
  };

  const releasePoolLease = () => {
    if (!poolStreamName) return;
    const name = poolStreamName;
    poolStreamName = null;
    // keepalive so it survives page unload / teardown
    doFetch(
      `${base}/live/${cameraId}/release?stream_name=${encodeURIComponent(name)}`,
      { method: 'POST', keepalive: true },
    ).catch(() => {});
  };

  pc.addTransceiver('video', { direction: 'recvonly' });
  pc.addTransceiver('audio', { direction: 'recvonly' });

  const mediaStream = new MediaStream();
  video.srcObject = mediaStream;

  const attachTrack = (track: MediaStreamTrack) => {
    if (!mediaStream.getTracks().includes(track)) mediaStream.addTrack(track);
  };
  const applyJitterBuffer = (receiver: RTCRtpReceiver) => {
    if (jitterBufferMs <= 0) return;
    try {
      (receiver as RTCRtpReceiver & { jitterBufferTarget?: number }).jitterBufferTarget =
        jitterBufferMs;
    } catch {
      /* Safari / older Chromium */
    }
  };
  const handleTrack = (track: MediaStreamTrack) => {
    if (track.kind === 'audio') {
      onAudioTrack?.();
      // Do NOT attach a silent/pending audio track: Chrome holds video frames to
      // A/V sync, which shows up as multi-second lag with green stats.
      if (!track.muted) {
        attachTrack(track);
        return;
      }
      track.addEventListener('unmute', () => attachTrack(track), { once: true });
      return;
    }
    attachTrack(track);
  };

  pc.ontrack = (event) => {
    if (!active) return;
    if (event.receiver) applyJitterBuffer(event.receiver);
    if (event.track) handleTrack(event.track);
    event.streams?.[0]?.getTracks().forEach(handleTrack);

    setStatus('live');
    video.muted = true;
    video.play().catch(() => {});

    if (statsIntervalMs > 0 && onStats && !statsPoller) {
      statsPoller = createStatsPoller(pc, video, onStats, statsIntervalMs);
    }
  };

  const negotiate = async () => {
    setStatus('connecting');

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // non-trickle: wait for ICE gathering, hard-capped
    await new Promise<void>((resolve) => {
      if (pc.iceGatheringState === 'complete') return resolve();
      const onState = () => {
        if (pc.iceGatheringState === 'complete') {
          pc.removeEventListener('icegatheringstatechange', onState);
          resolve();
        }
      };
      pc.addEventListener('icegatheringstatechange', onState);
      setTimeout(() => {
        pc.removeEventListener('icegatheringstatechange', onState);
        resolve();
      }, iceGatherTimeoutMs);
    });
    if (!active) return;

    const resp = await doFetch(`${base}/live/${cameraId}/webrtc`, {
      method: 'POST',
      body: pc.localDescription?.sdp ?? offer.sdp,
      headers: { 'Content-Type': 'application/sdp' },
    });
    if (!resp.ok) throw new Error(`WebRTC signaling failed (HTTP ${resp.status})`);

    const answerSdp = await resp.text();
    poolStreamName = resp.headers.get('X-Pool-Stream-Name');

    if (!active) {
      releasePoolLease();
      return;
    }

    if (poolStreamName && heartbeatMs > 0) {
      heartbeatTimer = setInterval(() => {
        if (!poolStreamName) return;
        doFetch(
          `${base}/live/${cameraId}/heartbeat?stream_name=${encodeURIComponent(poolStreamName)}`,
          { method: 'POST' },
        ).catch(() => {});
      }, heartbeatMs);
    }

    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: answerSdp }));
  };

  negotiate().catch(fail);

  return {
    cameraId,
    pc,
    status: () => status,
    poolStreamName: () => poolStreamName,
    close() {
      if (!active) return;
      active = false;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      statsPoller?.stop();
      releasePoolLease();
      try {
        pc.close();
      } catch {
        /* ignore */
      }
      if (video.srcObject === mediaStream) video.srcObject = null;
      setStatus('closed');
    },
  };
}

export { EMPTY_LIVE_STATS };
