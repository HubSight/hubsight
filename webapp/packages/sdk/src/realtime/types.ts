import type {
  NotificationItem,
  NvrStatusResponse,
  PoolStatusSummary,
  RecognitionLogItem,
} from '../types';
import type {
  CameraEvent,
  ForceLogoutEvent,
  MemberFaceUpdatedEvent,
  SessionRevokedEvent,
  VisionBoxesEvent,
} from './events';

export type RealtimeStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export type Unsubscribe = () => void;

export type RealtimeStatusListener = (status: RealtimeStatus) => void;

/**
 * Encapsulated Realtime Manager for HubSight.
 *
 * All built-in relay events are completely encapsulated. External clients
 * register event handlers exclusively through strongly-typed methods with the prefix "on".
 */
export interface RealtimeManager {
  readonly status: RealtimeStatus;
  isConnected(): boolean;

  // ── Connection Status ─────────────────────────────────────────────────────────
  onStatusChange(listener: RealtimeStatusListener): Unsubscribe;

  // ── Auth & Security ──────────────────────────────────────────────────────────
  onForceLogout(handler: (event: ForceLogoutEvent) => void): Unsubscribe;
  onSessionRevoked(handler: (event: SessionRevokedEvent) => void): Unsubscribe;

  // ── Notifications ────────────────────────────────────────────────────────────
  onNotification(handler: (item: NotificationItem) => void): Unsubscribe;

  // ── Computer Vision & Faces ──────────────────────────────────────────────────
  /** Listens to all person bounding box events (entered, update, left). */
  onVision(handler: (event: VisionBoxesEvent) => void): Unsubscribe;
  onVisionPersonEntered(handler: (event: VisionBoxesEvent) => void): Unsubscribe;
  onVisionPersonUpdate(handler: (event: VisionBoxesEvent) => void): Unsubscribe;
  onVisionPersonLeft(handler: (event: VisionBoxesEvent) => void): Unsubscribe;
  onRecognitionLog(handler: (item: RecognitionLogItem) => void): Unsubscribe;
  onMemberFaceUpdated(handler: (event: MemberFaceUpdatedEvent) => void): Unsubscribe;

  // ── Pool & NVR Monitoring ────────────────────────────────────────────────────
  onPoolStatus(handler: (status: PoolStatusSummary) => void): Unsubscribe;
  onNvrStatus(handler: (status: NvrStatusResponse) => void): Unsubscribe;

  // ── Camera Lifecycle ─────────────────────────────────────────────────────────
  /** Listens to all camera lifecycle events (started, stopped, updated). */
  onCamera(handler: (event: CameraEvent) => void): Unsubscribe;
  onCameraStarted(handler: (event: CameraEvent) => void): Unsubscribe;
  onCameraStopped(handler: (event: CameraEvent) => void): Unsubscribe;
  onCameraUpdated(handler: (event: CameraEvent) => void): Unsubscribe;

  // ── Lifecycle Controls ───────────────────────────────────────────────────────
  connect(): void;
  disconnect(): void;
  close(): void;
}

