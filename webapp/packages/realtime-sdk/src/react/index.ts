/**
 * `@hubsight/realtime/react` — React bindings.
 */
export { RealtimeProvider, useRealtimeContext } from './provider';
export type { RealtimeProviderProps } from './provider';

export { useRealtime, useRealtimeConnection, useRealtimeEvent } from './use-realtime';

export { useLiveStream } from './use-live-stream';
export type { UseLiveStreamOptions, UseLiveStreamResult } from './use-live-stream';

// re-export the core surface so consumers can `import { ... } from '@hubsight/realtime/react'`
export * from '../index';
