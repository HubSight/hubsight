/**
 * `@hubsight/realtime/react` — React bindings bridged to `@hubsight/sdk/react`.
 */

export { RealtimeProvider, type RealtimeProviderProps } from './provider';

export {
  useRealtimeEvent,
  useRealtimeStatus,
  useRealtimeStatus as useRealtime,
  useRealtimeStatus as useRealtimeConnection,
  useLiveStream,
  type UseRealtimeStatusResult,
  type UseLiveStreamOptions,
  type UseLiveStreamResult,
} from '@hubsight/sdk/react';

export * from '../index';
