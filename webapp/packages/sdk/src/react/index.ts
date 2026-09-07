/**
 * HubSight React Hooks and Context Provider.
 */

export {
  HubSightProvider,
  useHubSight,
  useHubSightOptional,
  type HubSightProviderProps,
} from './provider';

export { useAuth, type UseAuthResult } from './use-auth';

export {
  useRealtimeStatus,
  useRealtimeEvent,
  type UseRealtimeStatusResult,
} from './use-realtime';

export {
  useLiveStream,
  type UseLiveStreamOptions,
  type UseLiveStreamResult,
} from './use-live-stream';

