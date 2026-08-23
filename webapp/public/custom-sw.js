// Background & Offline Web Push Notification handler
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch (e) {
    payload = { title: 'HubSight', body: event.data.text() };
  }

    let targetUrl = '/playback';
    if (payload.camera_id) {
      targetUrl += `?camera_id=${payload.camera_id}`;
      if (payload.created_at) {
        const tsMs = new Date(payload.created_at).getTime();
        if (!isNaN(tsMs)) {
          targetUrl += `&t=${tsMs}`;
        }
      }
    }

    const title = payload.title || 'HubSight - Thông báo an ninh';
    const options = {
      body: payload.body || 'Phát hiện sự kiện mới từ camera',
      icon: '/pwa-192x192.png',
      badge: '/favicon.svg',
      image: payload.thumbnail_url || undefined,
      tag: payload.id || `hub-notif-${Date.now()}`,
      renotify: true,
      vibrate: [200, 100, 200],
      data: {
        url: targetUrl,
      },
    actions: [
      { action: 'open_playback', title: 'Xem lại' },
      { action: 'close', title: 'Bỏ qua' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Click handler when user taps notification on iOS/Android/Desktop
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const targetUrl = event.notification.data?.url || '/playback';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing tab if open
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          if ('navigate' in client) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      // Open new window/PWA app if closed
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
