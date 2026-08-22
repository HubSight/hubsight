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

export interface MemberFormData {
  name: string;
  role: MemberRole;
  avatar_url: string;
}
