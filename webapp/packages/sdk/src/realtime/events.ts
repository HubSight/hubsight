import type {
  NotificationItem,
  NvrStatusResponse,
  PoolStatusSummary,
  RecognitionLogItem,
} from '../types';

/** One detected object in normalized 0..1 coordinates */
export interface OverlayBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  state?: string;
  name?: string;
  track_id?: number;
  angle_deg?: number | null;
  /** 17 COCO pose keypoints, each [x, y, confidence] (x/y normalised 0..1) */
  keypoints?: number[][];
}

export interface VisionBoxesEvent {
  camera_id?: string;
  state?: string;
  timestamp?: number;
  boxes?: OverlayBox[];
  _timestamp?: string;
}

export interface ForceLogoutEvent {
  userId: string;
  reason?: string;
  message?: string;
  _timestamp?: string;
}

export interface CameraEvent {
  id?: string;
  name?: string;
  is_stopped?: boolean;
  alternative_id?: string;
  alternative_name?: string;
  _timestamp?: string;
}

export interface MemberFaceUpdatedEvent {
  member_id?: string;
  _timestamp?: string;
  [key: string]: unknown;
}

/**
 * Internal wire mapping for all 12 built-in HubSight realtime event names.
 * These are completely internal to the SDK and hidden from client consumers.
 */
export const INTERNAL_REALTIME_EVENTS = {
  AUTH_FORCE_LOGOUT: 'auth:force_logout',
  VISION_PERSON_ENTERED: 'vision.person.entered',
  VISION_PERSON_UPDATE: 'vision.person.update',
  VISION_PERSON_LEFT: 'vision.person.left',
  VISION_LOG_NEW: 'vision.log.new',
  MEMBER_FACE_UPDATED: 'member.face.updated',
  NOTIFICATION_NEW: 'notification.new',
  POOL_STATUS_UPDATE: 'pool.status.update',
  NVR_STATUS_UPDATE: 'nvr.status.update',
  CAMERA_STARTED: 'camera.started',
  CAMERA_STOPPED: 'camera.stopped',
  CAMERA_UPDATED: 'camera.updated',
} as const;

/**
 * Internal single source of truth for all 12 built-in HubSight realtime event payloads.
 */
export interface BuiltInRealtimeEvents {
  // Auth & Session
  'auth:force_logout': ForceLogoutEvent;

  // Computer Vision
  'vision.person.entered': VisionBoxesEvent;
  'vision.person.update': VisionBoxesEvent;
  'vision.person.left': VisionBoxesEvent;
  'vision.log.new': RecognitionLogItem;
  'member.face.updated': MemberFaceUpdatedEvent;

  // Notifications
  'notification.new': NotificationItem;

  // Connection Pool & NVR Monitoring
  'pool.status.update': PoolStatusSummary | { data: PoolStatusSummary };
  'nvr.status.update': NvrStatusResponse;

  // Camera Lifecycle
  'camera.started': CameraEvent;
  'camera.stopped': CameraEvent;
  'camera.updated': CameraEvent;
}

export type RealtimeEventMap = BuiltInRealtimeEvents;
export type RealtimeEventName = keyof RealtimeEventMap;

