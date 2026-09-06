import { useEffect, useRef, useState } from 'react';
import { startLiveStream, type LiveStreamOptions } from '../live-stream';
import { EMPTY_LIVE_STATS, type LiveStats, type LiveStatus } from '../types';
import { useRealtimeContext } from './provider';

export interface UseLiveStreamOptions
  extends Omit<LiveStreamOptions, 'cameraId' | 'video' | 'baseUrl' | 'onStatus' | 'onStats'> {
  /** Override the API base. Defaults to the `RealtimeProvider`'s `baseUrl`. */
  baseUrl?: string;
  /** Pause the connection (e.g. camera stopped, tab hidden). */
  enabled?: boolean;
  /** Poll `getStats()` and expose `stats`. Default `false` (opt-in for the trace panel). */
  withStats?: boolean;
  onStatusChange?: (status: LiveStatus) => void;
}

export interface UseLiveStreamResult {
  /** Attach to your `<video>` element. */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  status: LiveStatus;
  error: Error | null;
  hasAudio: boolean;
  stats: LiveStats;
  poolStreamName: string | null;
}

/**
 * Manage a WebRTC live view for one camera. Replaces the ~150-line WebRTC
 * `useEffect` in the old `LivePlayer`.
 */
export function useLiveStream(
  cameraId: string | null | undefined,
  options: UseLiveStreamOptions = {},
): UseLiveStreamResult {
  const providerBaseUrl = useRealtimeContext().baseUrl;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<LiveStatus>('idle');
  const [error, setError] = useState<Error | null>(null);
  const [hasAudio, setHasAudio] = useState(false);
  const [stats, setStats] = useState<LiveStats>(EMPTY_LIVE_STATS);
  const [poolStreamName, setPoolStreamName] = useState<string | null>(null);

  const {
    enabled = true,
    withStats = false,
    onStatusChange,
    baseUrl,
    jitterBufferMs,
    iceServers,
    heartbeatMs,
    iceGatherTimeoutMs,
    statsIntervalMs,
    fetch: fetchImpl,
    onError,
    onAudioTrack,
  } = options;

  // keep callbacks fresh without restarting the stream
  const cbRef = useRef({ onStatusChange, onError, onAudioTrack });
  cbRef.current = { onStatusChange, onError, onAudioTrack };

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !cameraId || !enabled) {
      setStatus('idle');
      return;
    }

    setStatus('connecting');
    setError(null);
    setHasAudio(false);
    setStats(EMPTY_LIVE_STATS);
    setPoolStreamName(null);

    const handle = startLiveStream({
      cameraId,
      video,
      baseUrl: baseUrl ?? providerBaseUrl,
      jitterBufferMs,
      iceServers,
      heartbeatMs,
      iceGatherTimeoutMs,
      statsIntervalMs,
      fetch: fetchImpl,
      onStatus: (s) => {
        setStatus(s);
        cbRef.current.onStatusChange?.(s);
      },
      onError: (e) => {
        setError(e);
        cbRef.current.onError?.(e);
      },
      onAudioTrack: () => {
        setHasAudio(true);
        cbRef.current.onAudioTrack?.();
      },
      onStats: withStats ? setStats : undefined,
    });

    setPoolStreamName(handle.poolStreamName());
    const id = setInterval(() => setPoolStreamName(handle.poolStreamName()), 1000);

    return () => {
      clearInterval(id);
      handle.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    cameraId,
    enabled,
    withStats,
    baseUrl,
    providerBaseUrl,
    jitterBufferMs,
    heartbeatMs,
    iceGatherTimeoutMs,
    statsIntervalMs,
    fetchImpl,
  ]);

  return { videoRef, status, error, hasAudio, stats, poolStreamName };
}
