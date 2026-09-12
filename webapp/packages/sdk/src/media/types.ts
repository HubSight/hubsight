export type LiveStreamState = 'idle' | 'connecting' | 'live' | 'error' | 'closed';

export interface LiveStreamStats {
  renderFps: number;
  decodeFps: number;
  droppedFrames: number;
  packetsLost: number;
  jitter: number;
  jitterBufferMs: number;
  rttMs: number;
  latencyMs: number;
  resolution: string;
  protocol: string;
  codec: string;
}

export const EMPTY_LIVE_STATS: LiveStreamStats = {
  renderFps: 0,
  decodeFps: 0,
  droppedFrames: 0,
  packetsLost: 0,
  jitter: 0,
  jitterBufferMs: 0,
  rttMs: 0,
  latencyMs: 0,
  resolution: '',
  protocol: 'Unknown',
  codec: 'Unknown',
};

export type Unsubscribe = () => void;

export interface CreateLiveStreamOptions {
  cameraId: string;
  /** Optional video element to immediately attach to */
  video?: HTMLVideoElement;
  /** Playout jitter buffer target in ms (default: 800) */
  jitterBufferMs?: number;
  /** Interval in ms for pool heartbeat keepalive (default: 15000) */
  heartbeatMs?: number;
  /**
   * Max ms to wait for ICE gathering before sending the offer (default: 4000).
   * Firefox's ICE agent gathers materially slower than Chromium's behind NAT
   * (async mDNS host-candidate registration, different STUN retry pacing), so
   * this needs real headroom — the wait still resolves early via
   * `icegatheringstatechange` on fast networks/browsers, so raising it does
   * not add latency to sessions that already gather quickly.
   */
  iceGatherTimeoutMs?: number;
  /** Interval in ms to poll stream statistics (default: 1000; 0 to disable) */
  statsIntervalMs?: number;

  onStatus?: (status: LiveStreamState) => void;
  onStats?: (stats: LiveStreamStats) => void;
  onError?: (error: Error) => void;
  onAudioTrack?: () => void;
}

export interface LiveStreamSession {
  readonly cameraId: string;
  readonly state: LiveStreamState;

  attach(video: HTMLVideoElement): void;
  detach(): void;
  setMuted(muted: boolean): void;
  setVolume(volume: number): void;
  hasAudio(): boolean;

  onStateChange(listener: (state: LiveStreamState) => void): Unsubscribe;
  onStats(listener: (stats: LiveStreamStats) => void): Unsubscribe;
  onError(listener: (error: Error) => void): Unsubscribe;

  destroy(): Promise<void>;
}

export interface MediaManager {
  createLiveStream(options: CreateLiveStreamOptions): LiveStreamSession;
}

