// `DeviceType` re-exported from `@hubsight/sdk` for existing import paths.
export type { DeviceType, CameraType } from '@hubsight/sdk';

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
  show_bbox: boolean;
}

// Backward compatibility alias
export type CameraFormData = DeviceFormData;
