/**
 * Checks whether the application is running in installed PWA standalone mode
 */
export const isPwa = (): boolean => {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as { standalone?: boolean }).standalone === true ||
    document.referrer.includes('android-app://')
  );
};

const PWA_REFRESH_TOKEN_KEY = 'pwa_refresh_token';

export const getPwaRefreshToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(PWA_REFRESH_TOKEN_KEY);
};

export const setPwaRefreshToken = (token: string): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PWA_REFRESH_TOKEN_KEY, token);
};

export const clearPwaRefreshToken = (): void => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(PWA_REFRESH_TOKEN_KEY);
};
