import { useEffect, useRef, useState } from 'react';
import type {
  CreateLiveStreamOptions,
  LiveStreamSession,
  LiveStreamState,
  LiveStreamStats,
} from '../media/types';
import { EMPTY_LIVE_STATS } from '../media/types';
import { useHubSight } from './provider';

export interface UseLiveStreamOptions
  extends Omit<CreateLiveStreamOptions, 'cameraId' | 'video' | 'onStatus' | 'onStats' | 'onError'> {
  enabled?: boolean;
  withStats?: boolean;
  onStatusChange?: (status: LiveStreamState) => void;
  onError?: (error: Error) => void;
}

export interface UseLiveStreamResult {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  status: LiveStreamState;
  isLive: boolean;
  error: Error | null;
  hasAudio: boolean;
  stats: LiveStreamStats;
  setMuted(muted: boolean): void;
  setVolume(volume: number): void;
}

/**
 * High-level React hook for WebRTC live video streaming.
 * Completely encapsulates RTCPeerConnection, ICE gathering, signaling, and pool lease.
 */
export function useLiveStream(
  cameraId: string | null | undefined,
  options: UseLiveStreamOptions = {},
): UseLiveStreamResult {
  const client = useHubSight();
  const media = client.media;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<LiveStreamState>('idle');
  const [error, setError] = useState<Error | null>(null);
  const [hasAudio, setHasAudio] = useState(false);
  const [stats, setStats] = useState<LiveStreamStats>(EMPTY_LIVE_STATS);

  const sessionRef = useRef<LiveStreamSession | null>(null);

  const {
    enabled = true,
    withStats = false,
    onStatusChange,
    onError,
    jitterBufferMs,
    heartbeatMs,
    iceGatherTimeoutMs,
    statsIntervalMs,
    onAudioTrack,
  } = options;

  const callbacksRef = useRef({ onStatusChange, onError, onAudioTrack });
  callbacksRef.current = { onStatusChange, onError, onAudioTrack };

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

    const session = media.createLiveStream({
      cameraId,
      video,
      jitterBufferMs,
      heartbeatMs,
      iceGatherTimeoutMs,
      statsIntervalMs: withStats ? (statsIntervalMs ?? 1000) : 0,
      onStatus: (nextState) => {
        setStatus(nextState);
        callbacksRef.current.onStatusChange?.(nextState);
      },
      onStats: withStats ? setStats : undefined,
      onError: (err) => {
        setError(err);
        callbacksRef.current.onError?.(err);
      },
      onAudioTrack: () => {
        setHasAudio(true);
        callbacksRef.current.onAudioTrack?.();
      },
    });

    sessionRef.current = session;

    return () => {
      sessionRef.current = null;
      void session.destroy();
    };
  }, [
    media,
    cameraId,
    enabled,
    withStats,
    jitterBufferMs,
    heartbeatMs,
    iceGatherTimeoutMs,
    statsIntervalMs,
  ]);

  const setMuted = (muted: boolean) => {
    sessionRef.current?.setMuted(muted);
  };

  const setVolume = (volume: number) => {
    sessionRef.current?.setVolume(volume);
  };

  return {
    videoRef,
    status,
    isLive: status === 'live',
    error,
    hasAudio,
    stats,
    setMuted,
    setVolume,
  };
}
