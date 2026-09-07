/**
 * HubSight WebRTC Media Streaming Subsystem.
 */

export { createMediaManager } from './manager';
export { createLiveStreamSession } from './session';
export { EMPTY_LIVE_STATS } from './types';
export type {
  MediaManager,
  LiveStreamSession,
  LiveStreamState,
  LiveStreamStats,
  CreateLiveStreamOptions,
  Unsubscribe as MediaUnsubscribe,
} from './types';

export type LiveStatus = import('./types').LiveStreamState;
export type LiveStats = import('./types').LiveStreamStats;
