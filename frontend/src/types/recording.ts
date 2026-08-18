export interface CameraItem {
  id: number;
  name: string;
  host: string;
  brand: string;
  is_active: boolean;
}

export interface Recording {
  id: number;
  camera_id: number;
  start_at: string;
  end_at: string;
  duration_seconds: number;
  file_path: string;
  size_bytes: number;
  created_at: string;
}
