/**
 * `@hubsight/realtime` — Bridge layer re-exporting from unified `@hubsight/sdk`.
 */

export {
  resolveApiBase,
  resolveSocketOrigin,
  DEFAULT_API_BASE,
  RELAY_PATH,
  EMPTY_LIVE_STATS,
} from '@hubsight/sdk';

export type {
  RealtimeManager,
  RealtimeStatus,
  RealtimeStatusListener,
  RealtimeUnsubscribe,
  RealtimeEventMap,
  RealtimeEventName,
  BuiltInRealtimeEvents,
  OverlayBox,
  VisionBoxesEvent,
  ForceLogoutEvent,
  CameraEvent,
  MemberFaceUpdatedEvent,
  MediaManager,
  LiveStreamSession,
  LiveStreamState,
  LiveStreamStats,
  CreateLiveStreamOptions,
  MediaUnsubscribe,
  NotificationItem,
  NotificationCategory,
  NotificationListResponse,
  RecognitionLogItem,
  RecognitionLogCategory,
  RecognitionLogType,
  StreamConnection,
  CameraPool,
  PoolStatusSummary,
  NvrCameraStatus,
  NvrStatusResponse,
} from '@hubsight/sdk';

// Legacy type aliases for backward compatibility
export type RealtimeClient = import('@hubsight/sdk').RealtimeManager;
export type LiveStatus = import('@hubsight/sdk').LiveStreamState;
export type LiveStats = import('@hubsight/sdk').LiveStreamStats;
export type ForceLogoutPayload = import('@hubsight/sdk').ForceLogoutEvent;
