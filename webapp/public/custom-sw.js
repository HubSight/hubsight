// Background & Offline Web Push / FCM notification handler.
// VitePWA imports this script into the generated Workbox service worker.

function toAbsoluteUrl(targetUrl) {
  try {
    return new URL(targetUrl || '/playback', self.location.origin).href;
  } catch {
    return new URL('/playback', self.location.origin).href;
  }
}

function playbackUrlFromPayload(payload) {
  if (payload.url) {
    return toAbsoluteUrl(payload.url);
  }

  let targetUrl = '/playback';
  if (payload.camera_id) {
    targetUrl += `?camera_id=${encodeURIComponent(payload.camera_id)}`;
    if (payload.created_at) {
      const tsMs = new Date(payload.created_at).getTime();
      if (!isNaN(tsMs)) {
        targetUrl += `&t=${tsMs}`;
      }
    }
  }
  return toAbsoluteUrl(targetUrl);
}

function unwrapPushPayload(raw) {
  if (!raw || typeof raw !== 'object') {
    return raw;
  }

  // FCM HTTP v1 envelope: { from, data, notification, fcmMessageId, collapse_key }
  const nested = {};
  if (raw.data && typeof raw.data === 'object') {
    Object.assign(nested, raw.data);
  }
  if (raw.notification && typeof raw.notification === 'object') {
    Object.assign(nested, raw.notification);
  }
  return Object.keys(nested).length > 0 ? { ...raw, ...nested } : raw;
}

function showHubSightNotification(payload) {
  const data = unwrapPushPayload(payload) || {};
  const absoluteUrl = playbackUrlFromPayload(data);
  const title = data.title || 'HubSight - Thông báo an ninh';
  const options = {
    body: data.body || 'Phát hiện sự kiện mới từ camera',
    icon: '/pwa-192x192.png',
    badge: '/favicon.svg',
    image: data.thumbnail_url || data.image || undefined,
    tag: data.id || data.tag || `hub-notif-${Date.now()}`,
    renotify: true,
    vibrate: [200, 100, 200],
    data: {
      url: absoluteUrl,
      camera_id: data.camera_id || '',
      id: data.id || '',
      created_at: data.created_at || '',
    },
    actions: [
      { action: 'open_playback', title: 'Xem lại' },
      { action: 'close', title: 'Bỏ qua' },
    ],
  };

  return self.registration.showNotification(title, options);
}

self.addEventListener('push', (event) => {
  if (!event.data) return;

  event.waitUntil(
    (async () => {
      let payload = {};
      try {
        payload = event.data.json();
      } catch {
        payload = { title: 'HubSight', body: event.data.text() };
      }

      // Display-message envelopes are already shown by the browser / FCM.
      // Keep our handler for data-only FCM payloads and native Web Push.
      if (
        payload &&
        payload.notification &&
        (payload.from || payload.collapse_key || payload.fcmMessageId)
      ) {
        return;
      }

      return showHubSightNotification(payload);
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const targetUrl = toAbsoluteUrl(
    event.notification.data?.url || '/playback',
  );

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          if ('navigate' in client) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    }),
  );
});
