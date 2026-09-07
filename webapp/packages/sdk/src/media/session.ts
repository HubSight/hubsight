import { InternalWebRtcEngine } from '../internal/webrtc/engine';
import type {
  CreateLiveStreamOptions,
  LiveStreamSession,
  LiveStreamState,
  LiveStreamStats,
  Unsubscribe,
} from './types';

export function createLiveStreamSession(
  options: CreateLiveStreamOptions & { http: import('../internal/http/types').InternalHttpClient },
): LiveStreamSession {
  const engine = new InternalWebRtcEngine(options);

  // Auto-start negotiation immediately
  void engine.start();

  return {
    get cameraId(): string {
      return engine.cameraId;
    },

    get state(): LiveStreamState {
      return engine.getState();
    },

    attach(video: HTMLVideoElement): void {
      engine.attach(video);
    },

    detach(): void {
      engine.detach();
    },

    setMuted(muted: boolean): void {
      engine.setMuted(muted);
    },

    setVolume(volume: number): void {
      engine.setVolume(volume);
    },

    hasAudio(): boolean {
      return engine.hasAudio();
    },

    onStateChange(listener: (state: LiveStreamState) => void): Unsubscribe {
      return engine.onStateChange(listener);
    },

    onStats(listener: (stats: LiveStreamStats) => void): Unsubscribe {
      return engine.onStats(listener);
    },

    onError(listener: (error: Error) => void): Unsubscribe {
      return engine.onError(listener);
    },

    async destroy(): Promise<void> {
      await engine.destroy();
    },
  };
}

