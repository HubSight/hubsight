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
