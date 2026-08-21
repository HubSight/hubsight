export interface NvrCameraStatus {
  camera_id: number;
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
