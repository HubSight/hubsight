import type { ResourceContext } from './context';
import type { NotificationListResponse, PushConfig, SubscribePushRequest } from '../types';

export interface NotificationsResource {
  /** `GET /notifications` — `{ notifications, unread_count }`. */
  list(): Promise<NotificationListResponse>;
  markRead(id: string): Promise<void>;
  markAllRead(): Promise<void>;
  remove(id: string): Promise<void>;
  /** `DELETE /notifications` — clear all. */
  clear(): Promise<void>;
  /** `POST /notifications/test` — trigger a test push to the current user. */
  sendTest(): Promise<void>;
  /** `GET /notifications/push-config` — VAPID key + Firebase web config. */
  pushConfig(): Promise<PushConfig>;
  /** `POST /notifications/subscribe-push` — FCM token or native Web Push subscription. */
  subscribePush(body: SubscribePushRequest): Promise<void>;
}

export function createNotificationsResource(ctx: ResourceContext): NotificationsResource {
  const { http } = ctx;

  return {
    async list() {
      const res = await http.get<NotificationListResponse>('/notifications');
      return {
        unread_count: res.data?.unread_count || 0,
        notifications: res.data?.notifications || [],
      };
    },

    async markRead(id) {
      await http.patch(`/notifications/${id}/read`);
    },

    async markAllRead() {
      await http.post('/notifications/read-all');
    },

    async remove(id) {
      await http.delete(`/notifications/${id}`);
    },

    async clear() {
      await http.delete('/notifications');
    },

    async sendTest() {
      await http.post('/notifications/test');
    },

    async pushConfig() {
      const res = await http.get<PushConfig>('/notifications/push-config');
      return res.data || {};
    },

    async subscribePush(body) {
      await http.post('/notifications/subscribe-push', body);
    },
  };
}
