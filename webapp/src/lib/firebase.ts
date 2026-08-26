import { initializeApp, getApps, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { getMessaging, isSupported, type Messaging } from 'firebase/messaging';

export type FirebaseWebConfig = {
  apiKey: string;
  authDomain?: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId: string;
  appId: string;
};

export type PushConfig = {
  vapidPublicKey?: string;
  firebase?: FirebaseWebConfig;
};

let app: FirebaseApp | null = null;
let messaging: Messaging | null = null;

export function isFirebaseWebConfigValid(
  cfg?: FirebaseWebConfig | null,
): cfg is FirebaseWebConfig {
  return Boolean(cfg?.apiKey && cfg.projectId && cfg.appId && cfg.messagingSenderId);
}

export async function getFirebaseMessaging(
  config: FirebaseWebConfig,
): Promise<Messaging | null> {
  if (!(await isSupported())) {
    return null;
  }

  const options: FirebaseOptions = {
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    storageBucket: config.storageBucket,
    messagingSenderId: config.messagingSenderId,
    appId: config.appId,
  };

  if (!app) {
    app = getApps()[0] ?? initializeApp(options);
  }
  if (!messaging) {
    messaging = getMessaging(app);
  }
  return messaging;
}
