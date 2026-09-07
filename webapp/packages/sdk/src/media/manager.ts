import type { InternalHttpClient } from '../internal/http/types';
import { createLiveStreamSession } from './session';
import type { CreateLiveStreamOptions, LiveStreamSession, MediaManager } from './types';

export interface CreateMediaManagerOptions {
  http: InternalHttpClient;
}

export function createMediaManager(options: CreateMediaManagerOptions): MediaManager {
  const { http } = options;

  return {
    createLiveStream(opts: CreateLiveStreamOptions): LiveStreamSession {
      return createLiveStreamSession({
        ...opts,
        http,
      });
    },
  };
}
