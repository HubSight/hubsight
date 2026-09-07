import type { InternalHttpClient } from '../internal/http/types';
import type { NotificationListResponse, PushConfig, SubscribePushRequest } from '../types';
import { resolveHttpClient, type HttpLike } from './context';

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

// ── Standalone Tree-Shakable Functions ───────────────────────────────────────

export async function listNotifications(client: HttpLike): Promise<NotificationListResponse> {
  const http = resolveHttpClient(client);
  const res = await http.get<NotificationListResponse>('/notifications');
  return {
    unread_count: res?.unread_count || 0,
    notifications: res?.notifications || [],
  };
}

export async function markNotificationRead(client: HttpLike, id: string): Promise<void> {
  const http = resolveHttpClient(client);
  await http.patch(`/notifications/${id}/read`);
}

export async function markAllNotificationsRead(client: HttpLike): Promise<void> {
  const http = resolveHttpClient(client);
  await http.post('/notifications/read-all');
}

export async function deleteNotification(client: HttpLike, id: string): Promise<void> {
  const http = resolveHttpClient(client);
  await http.delete(`/notifications/${id}`);
}

export async function clearNotifications(client: HttpLike): Promise<void> {
  const http = resolveHttpClient(client);
  await http.delete('/notifications');
}

export async function sendTestNotification(client: HttpLike): Promise<void> {
  const http = resolveHttpClient(client);
  await http.post('/notifications/test');
}

export async function getPushConfig(client: HttpLike): Promise<PushConfig> {
  const http = resolveHttpClient(client);
  const res = await http.get<PushConfig>('/notifications/push-config');
  return res || {};
}

export async function subscribePush(client: HttpLike, body: SubscribePushRequest): Promise<void> {
  const http = resolveHttpClient(client);
  await http.post('/notifications/subscribe-push', body);
}

// ── Resource Factory ─────────────────────────────────────────────────────────

export function createNotificationsResource(http: InternalHttpClient): NotificationsResource {
  return {
    list: () => listNotifications(http),
    markRead: (id) => markNotificationRead(http, id),
    markAllRead: () => markAllNotificationsRead(http),
    remove: (id) => deleteNotification(http, id),
    clear: () => clearNotifications(http),
    sendTest: () => sendTestNotification(http),
    pushConfig: () => getPushConfig(http),
    subscribePush: (body) => subscribePush(http, body),
  };
}
