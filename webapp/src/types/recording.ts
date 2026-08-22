export interface CameraItem {
  id: string;
  name: string;
  host: string;
  brand: string;
  is_active: boolean;
  enable_ai?: boolean;
}

export interface Recording {
  id: string;
  camera_id: string;
  start_at: string;
  end_at: string;
  duration_seconds: number;
  file_path: string;
  size_bytes: number;
  created_at: string;
}
