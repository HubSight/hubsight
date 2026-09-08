/**
 * HubSight TypeScript SDK.
 *
 * Unified standard SDK library for HubSight:
 * - Fully encapsulated HTTP client (no Axios types leaked)
 * - Tree-shakable architecture with fine-grained subpaths (/client, /auth, /realtime, /media, /resources, /errors, /types, /react)
 * - Complete Auth lifecycle and session state machine
 * - Encapsulated Realtime event bus with typed built-in events
 * - High-level WebRTC Media session management (no RTCPeerConnection leaked)
 * - Standalone pure resource functions + Cohesive resource namespacing for all HubSight REST APIs
 */

// ── Client Factories & Config ────────────────────────────────────────────────
export {
  createHubSightClient,
  createBaseClient,
  type HubSightClient,
  type BaseClient,
  type HubSightClientOptions,
  type BaseClientOptions,
} from './client';
export { resolveApiBase, resolveSocketOrigin, DEFAULT_API_BASE, RELAY_PATH } from './config';

// ── Standard Errors & Typeguards ─────────────────────────────────────────────
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
  toApiError,
  apiErrorMessage,
  type HubSightErrorOptions,
  type HubSightApiErrorOptions,
  type ValidationErrorOptions,
  type NetworkErrorOptions,
} from './errors';

// ── Auth Lifecycle, Session & PWA Storage ────────────────────────────────────
export type {
  AuthManager,
  AuthState,
  Session,
  AuthChangeEvent,
  AuthStateChangeListener,
  AuthUnsubscribe,
} from './auth';
export {
  LocalStorageSessionAdapter,
  MemorySessionAdapter,
  defaultSessionStorage,
  REFRESH_TOKEN_STORAGE_KEY,
  isPwa,
  getPwaRefreshToken,
  setPwaRefreshToken,
  clearPwaRefreshToken,
  defaultRefreshTokenStore,
  type SessionStorageAdapter,
  type RefreshTokenStore,
  isPasskeySupported,
} from './auth';

// ── Realtime & Event Payloads ────────────────────────────────────────────────
export type {
  RealtimeManager,
  RealtimeStatus,
  RealtimeStatusListener,
  RealtimeUnsubscribe,
  OverlayBox,
  VisionBoxesEvent,
  ForceLogoutEvent,
  CameraEvent,
  MemberFaceUpdatedEvent,
  RealtimeClient,
  ForceLogoutPayload,
} from './realtime';

// ── WebRTC & Media Session ───────────────────────────────────────────────────
export type {
  MediaManager,
  LiveStreamSession,
  LiveStreamState,
  LiveStreamStats,
  CreateLiveStreamOptions,
  MediaUnsubscribe,
  LiveStatus,
  LiveStats,
} from './media';
export { EMPTY_LIVE_STATS } from './media';

// ── REST Domain Resources & Standalone Tree-Shakable Functions ───────────────
export * from './resources';

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
  ApiClient,
  CreateClientRequest,
  UpdateClientRequest,
  ClientPlatform,
  ClientType,
  LoginRequest,
  LoginResponse,
  ChangePasswordRequest,
  PasskeyItem,
  TwoFactorSetupResponse,
  TwoFactorVerifyRequest,
  TwoFactorEnableRequest,
  TwoFactorDisableRequest,
  CameraType,
  CameraInput,
  CameraItem,
  DeviceType,
  NvrMode,
  RecordQuality,
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
  GoogleServiceAccount,
  ImportGoogleServiceAccountInput,
  ImportGoogleServiceAccountResponse,
  TestGoogleServiceAccountResult,
  AppConfig,
  GenerateAppConfigRequest,
  GenerateAppConfigResponse,
  AppConfigQRResponse,
  MobileConfig,
  GenerateMobileConfigRequest,
  GenerateMobileConfigResponse,
  MobileConfigQRResponse,
  FirebaseAppItem,
  FirebasePreflightResult,
} from './types';
