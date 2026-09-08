/**
 * HubSight Core Domain Models and Wire Types.
 * Single source of truth for the entire SDK and consuming apps.
 */

// ── Auth & RBAC ──────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'viewer';
export type Locale = 'vi' | 'en';

export interface UserPreferences {
  push_preferences?: Record<string, boolean>;
  [key: string]: unknown;
}

export interface Permission {
  id: string;
  code: string;
  name: string;
  description?: string;
  module: string;
  category?: string;
  created_at?: string;
}

export interface Role {
  id: string;
  code: string;
  name: string;
  description?: string;
  is_system?: boolean;
  permissions?: Permission[];
  created_at?: string;
  updated_at?: string;
}

export interface User {
  id: string;
  username: string;
  full_name?: string;
  role: UserRole | string;
  role_id?: string;
  role_info?: Role;
  permissions?: string[];
  locale?: Locale;
  timezone?: string;
  is_active: boolean;
  must_change_password?: boolean;
  two_factor_enabled?: boolean;
  push_preferences?: Record<string, boolean>;
  created_at?: string;
  last_login_at?: string;
  updated_at?: string;
}

export interface CreateUserRequest {
  username: string;
  full_name?: string;
  password: string;
  role_id?: string;
  is_active?: boolean;
  must_change_password?: boolean;
}

export interface UpdateUserRequest {
  full_name?: string;
  role_id?: string;
  is_active?: boolean;
  must_change_password?: boolean;
}

export interface ResetPasswordRequest {
  new_password: string;
  must_change_password?: boolean;
}

// ── Application Clients (API Keys & OAuth2 Governance) ──────────────────────

export type ClientPlatform = 'flutter_mobile' | 'web_spa' | 'third_party';
export type ClientType = 'public' | 'confidential';

export interface ApiClient {
  id: string;
  client_id: string;
  api_key: string;
  name: string;
  platform: ClientPlatform | string;
  client_type: ClientType | string;
  is_active: boolean;
  is_system: boolean;
  rate_limit_rps: number;
  created_at?: string;
  updated_at?: string;
  last_used_at?: string | null;
}

export interface CreateClientRequest {
  name: string;
  platform: ClientPlatform | string;
  client_type?: ClientType | string;
  rate_limit_rps?: number;
}

export interface UpdateClientRequest {
  name: string;
  platform: ClientPlatform | string;
  rate_limit_rps?: number;
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
  user?: User;
  refresh_token?: string;
  message?: string;
  status?: string;
  pre_auth_token?: string;
  must_change_password?: boolean;
}

// ── 2FA & MFA Types ─────────────────────────────────────────────────────────

export interface TwoFactorSetupResponse {
  secret: string;
  url: string;
  qr_code: string;
  recovery_codes: string[];
}

export interface TwoFactorVerifyRequest {
  pre_auth_token: string;
  code?: string;
  recovery_code?: string;
  is_pwa?: boolean;
}

export interface TwoFactorEnableRequest {
  code: string;
}

export interface TwoFactorDisableRequest {
  password?: string;
  code?: string;
}

// ── Passkey / WebAuthn Types ────────────────────────────────────────────────

export interface PasskeyItem {
  id: string;
  user_id: string;
  name: string;
  transports?: string[];
  backup_eligible?: boolean;
  backup_state?: boolean;
  created_at: string;
  last_used_at?: string;
}

export interface PasskeyRegisterOptionsResponse {
  publicKey: any;
  challenge_id: string;
}

export interface PasskeyLoginOptionsResponse {
  publicKey: any;
  challenge_id: string;
}

export interface ChangePasswordRequest {
  old_password?: string;
  new_password?: string;
  password?: string;
}

// ── Cameras & Devices ────────────────────────────────────────────────────────

export type NvrMode = 'disabled' | 'event' | 'full' | 'aor';
export type RecordQuality = 'standard' | 'hd';

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
  nvr_mode: NvrMode;
  record_quality: RecordQuality;
  created_at: string;
  updated_at: string;
}

export type CameraType = DeviceType;

export interface CameraItem {
  id: string;
  name: string;
  host: string;
  brand: string;
  is_active: boolean;
  is_stopped?: boolean;
  enable_ai?: boolean;
  show_bbox?: boolean;
  nvr_mode?: NvrMode;
  record_quality?: RecordQuality;
}

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
  nvr_mode?: NvrMode;
  record_quality?: RecordQuality;
  [key: string]: unknown;
}

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

// ── Members & Faces ──────────────────────────────────────────────────────────

export type MemberRole = 'family' | 'guest' | 'neighbor' | 'staff' | 'blacklist' | 'stranger';

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

// ── Notifications ────────────────────────────────────────────────────────────

export type NotificationCategory =
  | 'family'
  | 'guest'
  | 'stranger'
  | 'system'
  | 'risk'
  | 'fall'
  | 'suspicious';

export interface NotificationItem {
  id: string;
  camera_id?: string;
  type: string;
  title: string;
  body: string;
  category: NotificationCategory | string;
  member_id?: string;
  thumbnail_url?: string;
  is_read: boolean;
  created_at: string;
  _timestamp?: string;
}

export interface NotificationListResponse {
  unread_count: number;
  notifications: NotificationItem[];
}

// ── Recognition Logs ─────────────────────────────────────────────────────────

export type RecognitionLogCategory =
  | 'member'
  | 'guest'
  | 'stranger'
  | 'risk'
  | 'fall'
  | 'suspicious';

export type RecognitionLogType =
  | 'member_identified'
  | 'stranger_detected'
  | 'fire_detected'
  | 'smoke_detected'
  | 'weapon_detected'
  | 'fall_detected'
  | 'accident_detected'
  | 'suspicious';

export interface RecognitionLogItem {
  id: string;
  camera_id: string;
  type: RecognitionLogType | string;
  category: RecognitionLogCategory | string;
  member_id?: string;
  track_id?: number;
  message_key: string;
  message_params: Record<string, string>;
  created_at: string;
  _timestamp?: string;
}

// ── Connection Pool ──────────────────────────────────────────────────────────

export interface StreamConnection {
  id: string;
  camera_id: string;
  index: number;
  purpose: 'cv' | 'nvr' | 'live';
  stream_name: string;
  source_url: string;
  active_users: number;
  max_users: number;
  created_at: string;
  last_used_at: string;
  status: 'active' | 'idle' | 'error';
}

export interface CameraPool {
  camera_id: string;
  camera_name: string;
  host: string;
  is_active: boolean;
  enable_ai: boolean;
  cv_connection: StreamConnection | null;
  nvr_connection?: StreamConnection | null;
  live_pool: Record<string, StreamConnection>;
  next_live_index: number;
}

export interface PoolStatusSummary {
  total_cameras: number;
  active_cameras: number;
  total_cv_streams: number;
  total_nvr_streams?: number;
  total_live_streams: number;
  total_active_viewers: number;
  cameras: CameraPool[];
  _timestamp?: string;
}

// ── NVR Recorder & Settings ──────────────────────────────────────────────────

export interface NvrCameraStatus {
  camera_id: string;
  name: string;
  host: string;
  status: 'recording' | 'stalled' | 'disabled';
  nvr_mode?: NvrMode;
  record_quality?: RecordQuality;
  rtsp_transport: string;
  video_codec: string;
  audio_mode: string;
  segment_duration: number;
  latest_segment_at: string | null;
  latest_segment_size: number;
  total_segments: number;
}

export interface NvrStatusResponse {
  status: string;
  is_global_enabled?: boolean;
  system: {
    cpu_usage_percent: number;
    memory_alloc_mb: number;
    uptime_seconds: number;
    goroutines: number;
    num_cpu: number;
  };
  storage: {
    quota_bytes: number;
    used_bytes: number;
    free_bytes: number;
    used_percentage: number;
    retention_days: number;
  };
  active_live_streams_count: number;
  cameras: NvrCameraStatus[];
  _timestamp?: string;
}

export interface SettingsInput {
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

// ── Archive & Recordings ─────────────────────────────────────────────────────

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
  has_event?: boolean;
  event_type?: string;
}

export interface TimelineParams {
  camera_id: string;
  from: string;
  to: string;
}

// ── Push Notifications ───────────────────────────────────────────────────────

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

export interface SubscribePushRequest {
  token?: string;
  endpoint?: string;
  keys?: { p256dh: string; auth: string };
  user_agent?: string;
}
