/**
 * `@hubsight/realtime/react` — React bindings bridged to `@hubsight/sdk/react`.
 */

export { RealtimeProvider, type RealtimeProviderProps } from './provider';

export {
  useRealtimeStatus,
  useRealtimeStatus as useRealtime,
  useRealtimeStatus as useRealtimeConnection,
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
  useLiveStream,
  type UseRealtimeStatusResult,
  type UseLiveStreamOptions,
  type UseLiveStreamResult,
} from '@hubsight/sdk/react';

export * from '../index';
