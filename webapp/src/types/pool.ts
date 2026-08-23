export interface StreamConnection {
  id: string;
  camera_id: string;
  index: number;
  purpose: 'cv' | 'live';
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
  live_pool: Record<string, StreamConnection>;
  next_live_index: number;
}

export interface PoolStatusSummary {
  total_cameras: number;
  active_cameras: number;
  total_cv_streams: number;
  total_live_streams: number;
  total_active_viewers: number;
  cameras: CameraPool[];
}
