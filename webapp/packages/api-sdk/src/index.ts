/**
 * `@hubsight/api` — Bridge layer re-exporting from unified `@hubsight/sdk`.
 */

import {
  defaultSessionStorage,
  getErrorMessage,
  HubSightApiError,
  isApiError,
} from '@hubsight/sdk';

export {
  createHubSightClient,
  resolveApiBase,
  HubSightError,
  HubSightApiError,
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  ConflictError,
  HubSightNetworkError,
  isHubSightError,
  isApiError,
  getErrorMessage,
  defaultSessionStorage,
} from '@hubsight/sdk';

export type {
  HubSightClient,
  HubSightClientOptions,
  CamerasResource,
  DevicesResource,
  MembersResource,
  NotificationsResource,
  ArchiveResource,
  AccessResource,
  UsersResource,
  RolesResource,
  PermissionsResource,
  PoolResource,
  RecorderResource,
  User,
  Role,
  Permission,
  UserRole,
  Locale,
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
  PushConfig,
  SubscribePushRequest,
} from '@hubsight/sdk';

// ── Backwards-compatibility helpers ──────────────────────────────────────────
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
