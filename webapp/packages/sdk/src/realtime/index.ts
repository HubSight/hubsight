/**
 * HubSight Realtime Socket.IO Subsystem.
 */

export { createRealtimeManager } from './manager';
export { createInternalSocketClient } from '../internal/socket/client';
export type {
  RealtimeManager,
  RealtimeStatus,
  RealtimeStatusListener,
  Unsubscribe as RealtimeUnsubscribe,
} from './types';

export type {
  InternalSocketClient,
  SocketState,
  SocketStateListener,
} from '../internal/socket/types';
export type { CreateSocketClientOptions } from '../internal/socket/client';

export type {
  OverlayBox,
  VisionBoxesEvent,
  ForceLogoutEvent,
  CameraEvent,
  MemberFaceUpdatedEvent,
} from './events';

export type RealtimeClient = import('./types').RealtimeManager;
export type ForceLogoutPayload = import('./events').ForceLogoutEvent;
