/**
 * `@hubsight/realtime` — framework-agnostic core.
 *
 * - {@link createRealtimeClient}: the Socket.IO relay event bus.
 * - {@link startLiveStream}: a WebRTC live view for one camera.
 *
 * React bindings live at `@hubsight/realtime/react`.
 */
export { createRealtimeClient } from './client';
export type {
  RealtimeClient,
  RealtimeClientOptions,
  ConnectionListener,
  Unsubscribe,
} from './client';

export { startLiveStream } from './live-stream';
export type { LiveStreamOptions, LiveStreamHandle, FetchLike } from './live-stream';

export { createStatsPoller } from './stats';
export type { StatsPoller } from './stats';

export { resolveApiBase, resolveSocketOrigin, RELAY_PATH } from './config';

export * from './types';
