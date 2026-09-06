/**
 * PWA (installed standalone) detection and refresh-token persistence.
 *
 * When HubSight runs as an installed PWA, third-party cookies for the auth
 * session are unreliable, so the backend also issues a refresh token that the
 * client stores in `localStorage` and replays on a 401. In a normal browser tab
 * the httpOnly cookie is authoritative and none of this runs.
 */

/** Whether the app is running in installed PWA standalone mode. */
export function isPwa(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as { standalone?: boolean }).standalone === true ||
    document.referrer.includes('android-app://')
  );
}

const PWA_REFRESH_TOKEN_KEY = 'pwa_refresh_token';

export function getPwaRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(PWA_REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setPwaRefreshToken(token: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PWA_REFRESH_TOKEN_KEY, token);
  } catch {
    /* private mode / storage disabled — refresh just won't persist */
  }
}

export function clearPwaRefreshToken(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PWA_REFRESH_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/** Pluggable storage so the HTTP client can be driven in tests / native shells. */
export interface RefreshTokenStore {
  isPwa(): boolean;
  get(): string | null;
  set(token: string): void;
  clear(): void;
}

export const defaultRefreshTokenStore: RefreshTokenStore = {
  isPwa,
  get: getPwaRefreshToken,
  set: setPwaRefreshToken,
  clear: clearPwaRefreshToken,
};
