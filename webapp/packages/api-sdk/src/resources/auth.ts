import type { ResourceContext } from './context';
import type {
  ChangePasswordRequest,
  Locale,
  LoginRequest,
  LoginResponse,
  User,
} from '../types';

export interface AuthResource {
  /** `GET /auth/me` — the current session's user, or throws on 401. */
  me(): Promise<User>;
  /**
   * `POST /auth/login`. Detects installed-PWA mode, sends `is_pwa`, and persists
   * the returned refresh token (or clears any stale one) automatically.
   */
  login(body: LoginRequest): Promise<LoginResponse>;
  /** `POST /auth/logout` — clears the local PWA refresh token first, always resolves. */
  logout(): Promise<void>;
  /** `POST /auth/verify-password` — used to unlock the app lock screen. */
  verifyPassword(password: string): Promise<void>;
  changePassword(body: ChangePasswordRequest): Promise<void>;
  setLocale(locale: Locale): Promise<void>;
  setTimezone(timezone: string): Promise<void>;
  setPreferences(pushPreferences: Record<string, boolean>): Promise<void>;
}

export function createAuthResource(ctx: ResourceContext): AuthResource {
  const { http, refreshTokenStore } = ctx;

  return {
    async me() {
      const res = await http.get<User>('/auth/me');
      return res.data;
    },

    async login(body) {
      const runningAsPwa = refreshTokenStore.isPwa();
      const res = await http.post<LoginResponse>('/auth/login', {
        ...body,
        is_pwa: runningAsPwa,
      });
      const token = res.data?.refresh_token;
      if (runningAsPwa && token) {
        refreshTokenStore.set(token);
      } else {
        refreshTokenStore.clear();
      }
      return res.data;
    },

    async logout() {
      refreshTokenStore.clear();
      try {
        await http.post('/auth/logout');
      } catch {
        /* best-effort — the session is being discarded regardless */
      }
    },

    async verifyPassword(password) {
      await http.post('/auth/verify-password', { password });
    },

    async changePassword(body) {
      await http.put('/auth/password', body);
    },

    async setLocale(locale) {
      await http.put('/auth/locale', { locale });
    },

    async setTimezone(timezone) {
      await http.put('/auth/timezone', { timezone });
    },

    async setPreferences(pushPreferences) {
      await http.put('/auth/preferences', { push_preferences: pushPreferences });
    },
  };
}
