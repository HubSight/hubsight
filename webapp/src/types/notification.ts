export interface NotificationItem {
  id: string;
  camera_id?: string;
  type: string;
  title: string;
  body: string;
  category: 'family' | 'guest' | 'stranger' | 'system' | 'risk' | 'fall' | 'suspicious' | string;
  member_id?: string;
  thumbnail_url?: string;
  is_read: boolean;
  created_at: string;
}

export interface NotificationResponse {
  unread_count: number;
  notifications: NotificationItem[];
}
