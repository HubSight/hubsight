/**
 * Wire types for every realtime payload the HubSight relay broadcasts, plus the
 * WebRTC live-stream status/stats surface. These are the single source of truth —
 * the webapp re-exports them.
 */

// ── Recognition log (vision.log.new) ────────────────────────────────────────────
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
}

// ── Notifications (notification.new) ────────────────────────────────────────────
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
}

export interface NotificationListResponse {
  unread_count: number;
  notifications: NotificationItem[];
}

// ── Connection pool (pool.status.update) ────────────────────────────────────────
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
}

// ── NVR recorder (nvr.status.update) ────────────────────────────────────────────
export interface NvrCameraStatus {
  camera_id: string;
  name: string;
  host: string;
  status: 'recording' | 'stalled' | 'disabled';
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
}

// ── Camera lifecycle (camera.stopped / camera.started / camera.updated) ─────────
export interface CameraEvent {
  id?: string;
  name?: string;
  is_stopped?: boolean;
  alternative_id?: string;
  alternative_name?: string;
}

// ── Vision bounding boxes (vision.person.*) ─────────────────────────────────────
/** One detected object. Coordinates are normalised 0..1 of the source frame. */
export interface OverlayBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  state?: string;
  name?: string;
  track_id?: number;
  angle_deg?: number | null;
  /** 17 COCO pose keypoints, each `[x, y, confidence]` (x/y normalised 0..1). */
  keypoints?: number[][];
}

export interface VisionBoxesEvent {
  camera_id?: string;
  state?: string;
  timestamp?: number;
  boxes?: OverlayBox[];
}

// ── The typed event map ────────────────────────────────────────────────────────
export interface RealtimeEventMap {
  'vision.person.entered': VisionBoxesEvent;
  'vision.person.update': VisionBoxesEvent;
  'vision.person.left': VisionBoxesEvent;
  'vision.log.new': RecognitionLogItem;
  /** Member gallery / face vectors changed — no payload; consumers refetch. */
  'member.face.updated': unknown;
  'notification.new': NotificationItem;
  /** May arrive bare or wrapped as `{ data: PoolStatusSummary }`. */
  'pool.status.update': PoolStatusSummary | { data: PoolStatusSummary };
  'nvr.status.update': NvrStatusResponse;
  'camera.stopped': CameraEvent;
  'camera.started': CameraEvent;
  'camera.updated': CameraEvent;
}

export type RealtimeEventName = keyof RealtimeEventMap;

// ── Live WebRTC stream ─────────────────────────────────────────────────────────
export type LiveStatus = 'idle' | 'connecting' | 'live' | 'error' | 'closed';

export interface LiveStats {
  renderFps: number;
  decodeFps: number;
  droppedFrames: number;
  packetsLost: number;
  jitter: number;
  jitterBufferMs: number;
  rttMs: number;
  latencyMs: number;
  resolution: string;
  protocol: string;
  codec: string;
}

export const EMPTY_LIVE_STATS: LiveStats = {
  renderFps: 0,
  decodeFps: 0,
  droppedFrames: 0,
  packetsLost: 0,
  jitter: 0,
  jitterBufferMs: 0,
  rttMs: 0,
  latencyMs: 0,
  resolution: '',
  protocol: 'Unknown',
  codec: 'Unknown',
};
