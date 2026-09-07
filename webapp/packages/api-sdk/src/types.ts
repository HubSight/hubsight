/**
 * Wire types for the HubSight REST API.
 *
 * Domain payloads that the realtime relay also broadcasts (recognition logs,
 * notifications, pool status, NVR status) are owned by `@hubsight/realtime` and
 * re-exported here so both SDKs agree on one shape.
 */

export type {
  RecognitionLogItem,
  RecognitionLogType,
  RecognitionLogCategory,
  NotificationItem,
  NotificationCategory,
  NotificationListResponse,
  PoolStatusSummary,
  CameraPool,
  StreamConnection,
  NvrStatusResponse,
  NvrCameraStatus,
} from '@hubsight/realtime';

// ── Auth ───────────────────────────────────────────────────────────────────────
export type UserRole = 'admin' | 'viewer';
export type Locale = 'vi' | 'en';

export interface Permission {
  id: string;
  code: string;
  name: string;
  description?: string;
  module: string;
  created_at?: string;
}

export interface Role {
  id: string;
  code: string;
  name: string;
  description?: string;
  is_system: boolean;
  permissions?: Permission[];
  created_at?: string;
  updated_at?: string;
}

export interface User {
  id: string;
  username: string;
  full_name?: string;
  role: UserRole;
  role_id?: string;
  role_info?: Role;
  permissions?: string[];
  locale: Locale;
  timezone?: string;
  is_active: boolean;
  created_at: string;
  last_login_at: string;
  push_preferences?: Record<string, boolean>;
}

export interface CreateUserRequest {
  username: string;
  full_name?: string;
  password: string;
  role_id?: string;
  is_active?: boolean;
}

export interface UpdateUserRequest {
  full_name?: string;
  role_id?: string;
  is_active?: boolean;
}

export interface CreateRoleRequest {
  name: string;
  code: string;
  description?: string;
  permission_ids?: string[];
}

export interface UpdateRoleRequest {
  name: string;
  description?: string;
  permission_ids?: string[];
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  /** Only returned when the request was flagged `is_pwa` and refresh tokens are enabled. */
  refresh_token?: string;
  user?: User;
}

export interface ChangePasswordRequest {
  old_password: string;
  new_password: string;
}

// ── Cameras / devices ──────────────────────────────────────────────────────────
export interface DeviceType {
  id: string;
  name: string;
  host: string;
  brand: string;
  rtsp_port: number;
  rtsp_transport: string;
  segment_duration: number;
  video_codec: string;
  audio_mode: string;
  extra_args: string;
  is_active: boolean;
  is_stopped: boolean;
  enable_ai: boolean;
  show_bbox: boolean;
  created_at: string;
  updated_at: string;
}

/** Alias kept for call sites that speak in "cameras" rather than "devices". */
export type CameraType = DeviceType;

/** Lightweight camera shape used by the playback/timeline views. */
export interface CameraItem {
  id: string;
  name: string;
  host: string;
  brand: string;
  is_active: boolean;
  is_stopped?: boolean;
  enable_ai?: boolean;
  show_bbox?: boolean;
}

/** Payload accepted by `cameras.create` / `cameras.update`. Backend validates. */
export interface CameraInput {
  name?: string;
  host?: string;
  brand?: string;
  rtsp_port?: number;
  rtsp_transport?: string;
  segment_duration?: number;
  video_codec?: string;
  audio_mode?: string;
  extra_args?: string;
  is_active?: boolean;
  enable_ai?: boolean;
  show_bbox?: boolean;
  [key: string]: unknown;
}

// ── Members / faces ────────────────────────────────────────────────────────────
export type MemberRole = 'family' | 'guest' | 'neighbor' | 'staff';

export interface FaceItem {
  id: string;
  member_id: string;
  sample_image_url: string;
  quality_score: number;
  yaw: number;
  pitch: number;
  blur_score: number;
  created_at: string;
}

export interface MemberItem {
  id: string;
  name: string;
  role: MemberRole;
  avatar_url: string;
  is_active: boolean;
  face_count: number;
  faces?: FaceItem[];
  created_at: string;
  updated_at: string;
}

export interface MemberInput {
  name?: string;
  role?: MemberRole;
  avatar_url?: string;
  [key: string]: unknown;
}

export interface ListMembersParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: MemberRole | 'all';
}

/** Normalised member list — the raw endpoint may also return a bare array. */
export interface MembersPage {
  data: MemberItem[];
  total: number;
  family_count?: number;
  guest_count?: number;
}

export interface ListFacesParams {
  page?: number;
  limit?: number;
  sort_by?: string;
  order?: 'asc' | 'desc';
}

/** Normalised faces page — the raw endpoint mixes `faces`/`data` and `total_pages`. */
export interface FacesPage {
  faces: FaceItem[];
  total: number;
  total_pages: number;
}

export interface FaceEnrollResult {
  id?: string;
  sample_image_url?: string;
  [key: string]: unknown;
}

// ── Device network scan ────────────────────────────────────────────────────────
export interface ScanCandidate {
  ip: string;
  port: number;
  iface: string;
  via: string;
  brand: string;
  rtsp_url: string;
  path: string;
}

export interface ScanJob {
  id: string;
  status: 'running' | 'done' | 'canceled' | 'failed';
  scanned: number;
  total: number;
  iface: string;
  candidates: ScanCandidate[];
  error?: string;
}

// ── Archive / recordings ───────────────────────────────────────────────────────
export interface Recording {
  id: string;
  camera_id: string;
  start_at: string;
  end_at: string;
  duration_seconds: number;
  file_path: string;
  thumbnail_path?: string;
  size_bytes: number;
  created_at: string;
}

export interface TimelineParams {
  camera_id: string;
  from: string;
  to: string;
}

// ── Settings / NVR ─────────────────────────────────────────────────────────────
export interface SettingsInput {
  /** The webapp toggles this as a boolean; the backend also accepts a string. */
  nvr_status?: string | boolean;
  storage_quota_gb?: number;
  retention_days?: number;
  [key: string]: unknown;
}

export interface StorageCleanupResult {
  freed_bytes: number;
  deleted_count: number;
  [key: string]: unknown;
}

// ── Push notifications ─────────────────────────────────────────────────────────
export interface FirebaseWebConfig {
  apiKey: string;
  authDomain?: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId: string;
  appId: string;
}

export interface PushConfig {
  vapidPublicKey?: string;
  firebase?: FirebaseWebConfig;
}

/** Either an FCM token registration or a native Web Push subscription. */
export interface SubscribePushRequest {
  token?: string;
  endpoint?: string;
  keys?: { p256dh: string; auth: string };
  user_agent?: string;
}
