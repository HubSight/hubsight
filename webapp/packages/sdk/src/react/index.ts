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
  useRealtimeSubscription,
  useOnNotification,
  useOnForceLogout,
  useOnVision,
  useOnVisionPersonEntered,
  useOnVisionPersonUpdate,
  useOnVisionPersonLeft,
  useOnRecognitionLog,
  useOnMemberFaceUpdated,
  useOnPoolStatus,
  useOnNvrStatus,
  useOnCamera,
  useOnCameraStarted,
  useOnCameraStopped,
  useOnCameraUpdated,
  useOnStatusChange,
  type UseRealtimeStatusResult,
} from './use-realtime';

export {
  useLiveStream,
  type UseLiveStreamOptions,
  type UseLiveStreamResult,
} from './use-live-stream';

