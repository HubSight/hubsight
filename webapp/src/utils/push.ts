import axiosClient from '../api/axiosClient';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export const isPushNotificationSupported = (): boolean => {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
};

export const getPushNotificationPermission = (): NotificationPermission => {
  if (!isPushNotificationSupported()) return 'denied';
  return Notification.permission;
};

export const subscribeToWebPush = async (): Promise<boolean> => {
  if (!isPushNotificationSupported()) {
    console.warn('Web Push is not supported in this browser environment');
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return false;
    }

    const reg = await navigator.serviceWorker.ready;
    if (!reg) {
      console.warn('Service worker is not ready for push registration');
      return false;
    }

    // Get VAPID public key from backend
    const keyRes = await axiosClient.get('/notifications/vapid-key');
    const vapidPublicKey = keyRes.data?.publicKey;
    if (!vapidPublicKey) {
      throw new Error('No VAPID public key received');
    }

    const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);

    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey as unknown as BufferSource,
      });
    }

    const subJson = subscription.toJSON();
    if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
      throw new Error('Invalid push subscription format');
    }

    await axiosClient.post('/notifications/subscribe-push', {
      endpoint: subJson.endpoint,
      keys: {
        p256dh: subJson.keys.p256dh,
        auth: subJson.keys.auth,
      },
      user_agent: navigator.userAgent,
    });

    console.info('Web Push subscription successfully registered with backend.');
    return true;
  } catch (err) {
    console.error('Failed to subscribe to Web Push:', err);
    return false;
  }
};
