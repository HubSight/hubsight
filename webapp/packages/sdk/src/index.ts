/**
 * HubSight TypeScript SDK.
 *
 * Unified standard SDK library for HubSight:
 * - Fully encapsulated HTTP client (no Axios types leaked)
 * - Complete Auth lifecycle and session state machine
 * - Encapsulated Realtime event bus with 12 typed built-in events
 * - High-level WebRTC Media session management (no RTCPeerConnection leaked)
 * - Cohesive resource namespacing for all HubSight REST APIs
 */

// ── Client Factory & Config ──────────────────────────────────────────────────
export { createHubSightClient, type HubSightClient, type HubSightClientOptions } from './client';
export { resolveApiBase, resolveSocketOrigin, DEFAULT_API_BASE, RELAY_PATH } from './config';

// ── Standard Errors ──────────────────────────────────────────────────────────
export {
  HubSightError,
  HubSightApiError,
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  HubSightNetworkError,
  HubSightRealtimeError,
  HubSightMediaError,
  isHubSightError,
  isApiError,
  getErrorMessage,
  type HubSightErrorOptions,
  type HubSightApiErrorOptions,
  type ValidationErrorOptions,
  type NetworkErrorOptions,
} from './errors';

// ── Auth Lifecycle & Session ─────────────────────────────────────────────────
export type {
  AuthManager,
  AuthState,
  Session,
  AuthChangeEvent,
  AuthStateChangeListener,
  Unsubscribe as AuthUnsubscribe,
} from './auth/types';
export {
  LocalStorageSessionAdapter,
  MemorySessionAdapter,
  defaultSessionStorage,
  type SessionStorageAdapter,
} from './auth/storage';

// ── Realtime & Event Payloads ────────────────────────────────────────────────
export type {
  RealtimeManager,
  RealtimeStatus,
  RealtimeStatusListener,
  Unsubscribe as RealtimeUnsubscribe,
} from './realtime/types';
export type {
  OverlayBox,
  VisionBoxesEvent,
  ForceLogoutEvent,
  CameraEvent,
  MemberFaceUpdatedEvent,
} from './realtime/events';

// ── WebRTC & Media Session ───────────────────────────────────────────────────
export type {
  MediaManager,
  LiveStreamSession,
  LiveStreamState,
  LiveStreamStats,
  CreateLiveStreamOptions,
  Unsubscribe as MediaUnsubscribe,
} from './media/types';
export { EMPTY_LIVE_STATS } from './media/types';

// ── REST Domain Resources ────────────────────────────────────────────────────
export type { CamerasResource } from './resources/cameras';
export type { DevicesResource } from './resources/devices';
export type { MembersResource } from './resources/members';
export type { NotificationsResource } from './resources/notifications';
export type { ArchiveResource } from './resources/archive';
export type { AccessResource, UsersResource, RolesResource, PermissionsResource } from './resources/access';
export type { PoolResource } from './resources/pool';
export type { RecorderResource } from './resources/recorder';

// ── Domain Models & Wire Types ───────────────────────────────────────────────
export type {
  User,
  Role,
  Permission,
  UserRole,
  Locale,
  UserPreferences,
  CreateUserRequest,
  UpdateUserRequest,
  CreateRoleRequest,
  UpdateRoleRequest,
  LoginRequest,
  LoginResponse,
  ChangePasswordRequest,
  CameraType,
  CameraInput,
  CameraItem,
  DeviceType,
  ScanCandidate,
  ScanJob,
  MemberItem,
  MemberRole,
  FaceItem,
  MemberInput,
  ListMembersParams,
  MembersPage,
  ListFacesParams,
  FacesPage,
  FaceEnrollResult,
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
  SettingsInput,
  StorageCleanupResult,
  Recording,
  TimelineParams,
  FirebaseWebConfig,
  PushConfig,
  SubscribePushRequest,
} from './types';

// ── Backwards-compatibility helpers & aliases ───────────────────────────────
import { getErrorMessage, isApiError, HubSightApiError } from './errors';
import { defaultSessionStorage } from './auth/storage';
import type { RealtimeManager } from './realtime/types';
import type { LiveStreamState, LiveStreamStats } from './media/types';
import type { ForceLogoutEvent } from './realtime/events';

export const apiErrorMessage = getErrorMessage;

export function toApiError(err: unknown, fallback?: string): HubSightApiError {
  if (isApiError(err)) return err;
  return new HubSightApiError(getErrorMessage(err, fallback), { cause: err });
}

export const isPwa = (): boolean => defaultSessionStorage.isPwa();
export const getPwaRefreshToken = (): string | null => defaultSessionStorage.getToken();
export const setPwaRefreshToken = (tok: string): void => defaultSessionStorage.setToken(tok);
export const clearPwaRefreshToken = (): void => defaultSessionStorage.clear();
export const defaultRefreshTokenStore = defaultSessionStorage;
export type RefreshTokenStore = typeof defaultSessionStorage;

export type RealtimeClient = RealtimeManager;
export type LiveStatus = LiveStreamState;
export type LiveStats = LiveStreamStats;
export type ForceLogoutPayload = ForceLogoutEvent;

