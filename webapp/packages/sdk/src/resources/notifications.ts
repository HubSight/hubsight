import type { InternalHttpClient } from '../internal/http/types';
import type { NotificationListResponse, PushConfig, SubscribePushRequest } from '../types';

export interface NotificationsResource {
  list(): Promise<NotificationListResponse>;
  markRead(id: string): Promise<void>;
  markAllRead(): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
  sendTest(): Promise<void>;
  pushConfig(): Promise<PushConfig>;
  subscribePush(body: SubscribePushRequest): Promise<void>;
}

export function createNotificationsResource(http: InternalHttpClient): NotificationsResource {
  return {
    async list(): Promise<NotificationListResponse> {
      const res = await http.get<NotificationListResponse>('/notifications');
      return {
        unread_count: res?.unread_count || 0,
        notifications: res?.notifications || [],
      };
    },

    async markRead(id: string): Promise<void> {
      await http.patch(`/notifications/${id}/read`);
    },

    async markAllRead(): Promise<void> {
      await http.post('/notifications/read-all');
    },

    async remove(id: string): Promise<void> {
      await http.delete(`/notifications/${id}`);
    },

    async clear(): Promise<void> {
      await http.delete('/notifications');
    },

    async sendTest(): Promise<void> {
      await http.post('/notifications/test');
    },

    async pushConfig(): Promise<PushConfig> {
      const res = await http.get<PushConfig>('/notifications/push-config');
      return res || {};
    },

    async subscribePush(body: SubscribePushRequest): Promise<void> {
      await http.post('/notifications/subscribe-push', body);
    },
  };
}

