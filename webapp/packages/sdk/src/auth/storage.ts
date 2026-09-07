/**
 * Abstract storage adapter for PWA refresh token persistence.
 * Safe for browser, SSR, Electron, or test environments.
 */

export interface SessionStorageAdapter {
  isPwa(): boolean;
  getToken(): string | null;
  setToken(token: string): void;
  clear(): void;
}

export const REFRESH_TOKEN_STORAGE_KEY = 'hubsight_refresh_token';

export class LocalStorageSessionAdapter implements SessionStorageAdapter {
  private readonly key: string;

  constructor(key: string = REFRESH_TOKEN_STORAGE_KEY) {
    this.key = key;
  }

  isPwa(): boolean {
    if (typeof window === 'undefined') return false;
    const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches;
    const isIosStandalone = (navigator as unknown as { standalone?: boolean })?.standalone;
    return Boolean(isStandalone || isIosStandalone);
  }

  getToken(): string | null {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    try {
      return window.localStorage.getItem(this.key);
    } catch {
      return null;
    }
  }

  setToken(token: string): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(this.key, token);
    } catch {
      /* ignore storage quota / disabled errors */
    }
  }

  clear(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.removeItem(this.key);
    } catch {
      /* ignore */
    }
  }
}

export class MemorySessionAdapter implements SessionStorageAdapter {
  private token: string | null = null;
  private pwaMode = false;

  constructor(isPwa = false) {
    this.pwaMode = isPwa;
  }

  isPwa(): boolean {
    return this.pwaMode;
  }

  getToken(): string | null {
    return this.token;
  }

  setToken(token: string): void {
    this.token = token;
  }

  clear(): void {
    this.token = null;
  }
}

export const defaultSessionStorage: SessionStorageAdapter = new LocalStorageSessionAdapter();

export const isPwa = (): boolean => defaultSessionStorage.isPwa();
export const getPwaRefreshToken = (): string | null => defaultSessionStorage.getToken();
export const setPwaRefreshToken = (tok: string): void => defaultSessionStorage.setToken(tok);
export const clearPwaRefreshToken = (): void => defaultSessionStorage.clear();
export const defaultRefreshTokenStore = defaultSessionStorage;
export type RefreshTokenStore = typeof defaultSessionStorage;
