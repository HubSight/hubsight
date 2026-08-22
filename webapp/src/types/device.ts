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
  enable_ai: boolean;
  created_at: string;
  updated_at: string;
}

export interface DeviceFormData {
  name: string;
  brand: string;
  host: string;
  isManualUrl: boolean;
  builderIp: string;
  builderPort: number;
  builderUser: string;
  builderPass: string;
  builderPath?: string;
  builderChannel: number;
  builderIsSub: boolean;
  rtspTransport: string;
  rtspPort: number;
  segmentDuration: number;
  videoCodec: string;
  audioMode: string;
  extraArgs: string;
  enable_ai: boolean;
}

// Backward compatibility aliases
export type CameraType = DeviceType;
export type CameraFormData = DeviceFormData;
