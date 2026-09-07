import { getToken } from 'firebase/messaging';
import { api } from '../api/client';
import {
  getFirebaseMessaging,
  isFirebaseWebConfigValid,
  type PushConfig,
} from '../lib/firebase';

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
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
};

export const getPushNotificationPermission = (): NotificationPermission => {
  if (!isPushNotificationSupported()) return 'denied';
  return Notification.permission;
};

async function fetchPushConfig(): Promise<PushConfig> {
  return (await api.notifications.pushConfig()) as PushConfig;
}

async function registerFcmToken(vapidPublicKey: string, config: PushConfig['firebase']): Promise<boolean> {
  if (!isFirebaseWebConfigValid(config)) {
    return false;
  }

  const messaging = await getFirebaseMessaging(config);
  if (!messaging) {
    return false;
  }

  const registration = await navigator.serviceWorker.ready;
  const token = await getToken(messaging, {
    vapidKey: vapidPublicKey,
    serviceWorkerRegistration: registration,
  });
  if (!token) {
    return false;
  }

  await api.notifications.subscribePush({
    token,
    user_agent: navigator.userAgent,
  });
  console.info('FCM web push token registered with backend.');
  return true;
}

async function registerNativeWebPush(vapidPublicKey: string): Promise<boolean> {
  const registration = await navigator.serviceWorker.ready;
  const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: convertedVapidKey as unknown as BufferSource,
    });
  }

  const subJson = subscription.toJSON();
  if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
    throw new Error('Invalid push subscription format');
  }

  await api.notifications.subscribePush({
    endpoint: subJson.endpoint,
    keys: {
      p256dh: subJson.keys.p256dh,
      auth: subJson.keys.auth,
    },
    user_agent: navigator.userAgent,
  });
  console.info('Native Web Push subscription registered with backend.');
  return true;
}

export const subscribeToWebPush = async (
  opts: { requestPermission?: boolean } = {},
): Promise<boolean> => {
  if (!isPushNotificationSupported()) {
    console.warn('Web Push is not supported in this browser environment');
    return false;
  }

  try {
    const shouldAsk = opts.requestPermission !== false;
    if (Notification.permission === 'default' && shouldAsk) {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        return false;
      }
    }
    if (Notification.permission !== 'granted') {
      return false;
    }

    const config = await fetchPushConfig();
    const vapidPublicKey = config.vapidPublicKey;
    if (!vapidPublicKey) {
      throw new Error('No VAPID public key received');
    }

    if (isFirebaseWebConfigValid(config.firebase)) {
      try {
        const ok = await registerFcmToken(vapidPublicKey, config.firebase);
        if (ok) {
          return true;
        }
        console.warn('FCM token was empty; falling back to native Web Push');
      } catch (err) {
        console.warn('FCM getToken failed; falling back to native Web Push', err);
      }
    }

    return await registerNativeWebPush(vapidPublicKey);
  } catch (err) {
    console.error('Failed to subscribe to Web Push:', err);
    return false;
  }
};
