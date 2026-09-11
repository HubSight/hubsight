/**
 * HubSight React Hooks and Context Provider.
 */

export {
  HubSightProvider,
  useHubSight,
  useHubSightOptional,
  RealtimeProvider,
  useRealtimeContext,
  type HubSightProviderProps,
  type RealtimeProviderProps,
} from './provider';

export { useAuth, type UseAuthResult } from './use-auth';

export {
  useRealtimeStatus,
  useRealtimeStatus as useRealtime,
  useRealtimeStatus as useRealtimeConnection,
  useRealtimeSubscription,
  useOnNotification,
  useOnForceLogout,
  useOnSessionRevoked,
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

export type {
  OverlayBox,
  VisionBoxesEvent,
  ForceLogoutEvent,
  SessionRevokedEvent,
  CameraEvent,
  MemberFaceUpdatedEvent,
} from '../realtime/events';

export type {
  LiveStreamState,
  LiveStreamStats,
} from '../media/types';

export type {
  RealtimeClient,
  LiveStatus,
  LiveStats,
  ForceLogoutPayload,
} from '../index';

