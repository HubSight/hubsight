import type { InternalHttpClient } from '../internal/http/types';
import type {
  ChangePasswordRequest,
  Locale,
  LoginRequest,
  LoginResponse,
  PasskeyItem,
  ThemePreference,
  TwoFactorSetupResponse,
  TwoFactorVerifyRequest,
  User,
} from '../types';
import {
  prepareCreationOptions,
  serializeCreationResponse,
  prepareRequestOptions,
  serializeRequestResponse,
} from './webauthn-client';
import type { SessionStorageAdapter } from './storage';
import type {
  AuthChangeEvent,
  AuthManager,
  AuthState,
  AuthStateChangeListener,
  Session,
  Unsubscribe,
} from './types';

export interface CreateAuthManagerOptions {
  http: InternalHttpClient;
  storage: SessionStorageAdapter;
  onForceLogout?: (reason?: string, message?: string) => void;
}

export function createAuthManager(options: CreateAuthManagerOptions): AuthManager {
  const { http, storage, onForceLogout } = options;

  let currentUser: User | null = null;
  let currentSession: Session | null = null;
  let currentState: AuthState = 'idle';

  const listeners = new Set<AuthStateChangeListener>();

  const emitChange = (event: AuthChangeEvent, session: Session | null) => {
    for (const listener of listeners) {
      try {
        listener(event, session);
      } catch {
        /* listener errors should not break the auth manager */
      }
    }
  };

  const updateSession = (user: User | null, token?: string): Session | null => {
    currentUser = user;
    if (user) {
      currentSession = {
        user,
        token: token ?? storage.getToken() ?? undefined,
        isPwa: storage.isPwa(),
      };
      currentState = 'authenticated';
    } else {
      currentSession = null;
      currentState = 'unauthenticated';
    }
    return currentSession;
  };

  const manager: AuthManager = {
    get state(): AuthState {
      return currentState;
    },

    getUser(): User | null {
      return currentUser;
    },

    getSession(): Session | null {
      return currentSession;
    },

    isAuthenticated(): boolean {
      return Boolean(currentUser);
    },

    can(...permissions: string[]): boolean {
      if (!currentUser) return false;
      if (currentUser.role === 'admin') return true;
      const userPerms = currentUser.permissions || [];
      if (userPerms.includes('*')) return true;
      return permissions.some((p) => userPerms.includes(p));
    },

    onAuthStateChange(listener: AuthStateChangeListener): Unsubscribe {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async login(credentials: LoginRequest): Promise<LoginResponse> {
      currentState = 'loading';
      const isPwa = storage.isPwa();

      try {
        const res = await http.post<LoginResponse>('/auth/login', {
          ...credentials,
          is_pwa: isPwa,
        });

        if (res.status === '2fa_required') {
          currentState = 'unauthenticated';
          return res;
        }

        const token = res.refresh_token;
        if (isPwa && token) {
          storage.setToken(token);
        } else {
          storage.clear();
        }

        let user = res.user;
        if (!user) {
          try {
            user = await http.get<User>('/auth/me');
          } catch {
            /* best-effort */
          }
        }

        const session = updateSession(user ?? null, token);
        emitChange('SIGNED_IN', session);
        return { ...res, user };
      } catch (err) {
        currentState = currentUser ? 'authenticated' : 'unauthenticated';
        throw err;
      }
    },

    async logout(): Promise<void> {
      storage.clear();
      updateSession(null);

      try {
        await http.post('/auth/logout');
      } catch {
        /* best-effort — session is already cleared locally */
      }

      emitChange('SIGNED_OUT', null);
    },

    async me(): Promise<User> {
      currentState = 'loading';
      try {
        const user = await http.get<User>('/auth/me');
        const session = updateSession(user);
        emitChange('USER_UPDATED', session);
        return user;
      } catch (err) {
        updateSession(null);
        throw err;
      }
    },

    async refreshSession(): Promise<boolean> {
      if (!storage.isPwa()) {
        return false;
      }

      const storedToken = storage.getToken();
      if (!storedToken) {
        return false;
      }

      try {
        const res = await http.post<{ refresh_token?: string }>('/auth/refresh', {
          refresh_token: storedToken,
        });

        if (res?.refresh_token) {
          storage.setToken(res.refresh_token);
        }

        const user = await http.get<User>('/auth/me');
        const session = updateSession(user, res?.refresh_token ?? storedToken);
        emitChange('TOKEN_REFRESHED', session);
        return true;
      } catch {
        storage.clear();
        updateSession(null);
        emitChange('SIGNED_OUT', null);
        return false;
      }
    },

    async verifyPassword(password: string): Promise<boolean> {
      await http.post('/auth/verify-password', { password });
      return true;
    },

    async changePassword(body: ChangePasswordRequest): Promise<void> {
      await http.put('/auth/password', body);
    },

    async setLocale(locale: Locale): Promise<void> {
      await http.put('/auth/locale', { locale });
      if (currentUser) {
        currentUser = { ...currentUser, locale };
        if (currentSession) currentSession.user = currentUser;
        emitChange('USER_UPDATED', currentSession);
      }
    },

    async setTimezone(timezone: string): Promise<void> {
      await http.put('/auth/timezone', { timezone });
      if (currentUser) {
        currentUser = { ...currentUser, timezone };
        if (currentSession) currentSession.user = currentUser;
        emitChange('USER_UPDATED', currentSession);
      }
    },

    async setTheme(theme: ThemePreference): Promise<void> {
      await http.put('/auth/theme', { theme });
      if (currentUser) {
        currentUser = { ...currentUser, theme };
        if (currentSession) currentSession.user = currentUser;
        emitChange('USER_UPDATED', currentSession);
      }
    },

    async setPreferences(preferences: Record<string, boolean>): Promise<void> {
      await http.put('/auth/preferences', { push_preferences: preferences });
      if (currentUser) {
        currentUser = { ...currentUser, push_preferences: preferences };
        if (currentSession) currentSession.user = currentUser;
        emitChange('USER_UPDATED', currentSession);
      }
    },

    // ── Two-Factor Authentication (2FA) ──────────────────────────────────────
    async setup2FA(): Promise<TwoFactorSetupResponse> {
      return await http.post<TwoFactorSetupResponse>('/auth/2fa/setup');
    },

    async enable2FA(code: string): Promise<void> {
      await http.post('/auth/2fa/enable', { code });
      if (currentUser) {
        currentUser = { ...currentUser, two_factor_enabled: true };
        if (currentSession) currentSession.user = currentUser;
        emitChange('USER_UPDATED', currentSession);
      }
    },

    async disable2FA(password?: string, code?: string): Promise<void> {
      await http.post('/auth/2fa/disable', { password, code });
      if (currentUser) {
        currentUser = { ...currentUser, two_factor_enabled: false };
        if (currentSession) currentSession.user = currentUser;
        emitChange('USER_UPDATED', currentSession);
      }
    },

    async regenerateRecoveryCodes(password: string): Promise<string[]> {
      const res = await http.post<{ status: string; recovery_codes: string[] }>('/auth/2fa/recovery-codes', {
        password,
      });
      return res.recovery_codes || [];
    },

    async verify2FA(payload: TwoFactorVerifyRequest): Promise<LoginResponse> {
      currentState = 'loading';
      const isPwa = storage.isPwa();

      try {
        const res = await http.post<LoginResponse>('/auth/2fa/verify', {
          ...payload,
          is_pwa: isPwa,
        });

        const token = res.refresh_token;
        if (isPwa && token) {
          storage.setToken(token);
        } else {
          storage.clear();
        }

        let user = res.user;
        if (!user) {
          try {
            user = await http.get<User>('/auth/me');
          } catch {
            /* best-effort */
          }
        }

        const session = updateSession(user ?? null, token);
        emitChange('SIGNED_IN', session);
        return { ...res, user };
      } catch (err) {
        currentState = currentUser ? 'authenticated' : 'unauthenticated';
        throw err;
      }
    },

    // ── Passkey / WebAuthn ───────────────────────────────────────────────────
    async listPasskeys(): Promise<PasskeyItem[]> {
      return await http.get<PasskeyItem[]>('/auth/passkeys');
    },

    async registerPasskey(name: string): Promise<PasskeyItem> {
      const optRes = await http.post<{ publicKey: any; challenge_id: string }>(
        '/auth/passkeys/register/options'
      );
      const creationOptions = prepareCreationOptions(optRes.publicKey);
      const credential = (await navigator.credentials.create(creationOptions)) as PublicKeyCredential;
      if (!credential) {
        throw new Error('Passkey registration was canceled');
      }

      const serialized = serializeCreationResponse(credential);
      const verifyRes = await http.post<{ status: string; passkey: PasskeyItem }>(
        '/auth/passkeys/register/verify',
        {
          challenge_id: optRes.challenge_id,
          name,
          credential: serialized,
        }
      );

      return verifyRes.passkey;
    },

    async renamePasskey(id: string, name: string): Promise<void> {
      await http.put(`/auth/passkeys/${id}`, { name });
    },

    async deletePasskey(id: string): Promise<void> {
      await http.delete(`/auth/passkeys/${id}`);
    },

    async loginWithPasskey(username: string, conditional?: boolean): Promise<LoginResponse> {
      currentState = 'loading';
      const isPwa = storage.isPwa();

      const trimmedUser = username?.trim();
      if (!trimmedUser) {
        currentState = currentUser ? 'authenticated' : 'unauthenticated';
        const err: any = new Error('username_required');
        err.code = 'username_required';
        throw err;
      }

      try {
        const optRes = await http.post<{ publicKey: any; challenge_id: string }>(
          '/auth/passkeys/login/options',
          { username: trimmedUser }
        );
        const reqOptions = prepareRequestOptions(optRes.publicKey);
        if (conditional) {
          (reqOptions as any).mediation = 'conditional';
        }

        const credential = (await navigator.credentials.get(reqOptions)) as PublicKeyCredential;
        if (!credential) {
          throw new Error('Passkey login was canceled');
        }

        const serialized = serializeRequestResponse(credential);
        const res = await http.post<LoginResponse>('/auth/passkeys/login/verify', {
          challenge_id: optRes.challenge_id,
          credential: serialized,
          is_pwa: isPwa,
        });

        const token = res.refresh_token;
        if (isPwa && token) {
          storage.setToken(token);
        } else {
          storage.clear();
        }

        let user = res.user;
        if (!user) {
          try {
            user = await http.get<User>('/auth/me');
          } catch {
            /* best-effort */
          }
        }

        const session = updateSession(user ?? null, token);
        emitChange('SIGNED_IN', session);
        return { ...res, user };
      } catch (err) {
        currentState = currentUser ? 'authenticated' : 'unauthenticated';
        throw err;
      }
    },

    handleForceLogout(reason?: string, message?: string): void {
      storage.clear();
      updateSession(null);
      onForceLogout?.(reason, message);
      emitChange('FORCE_LOGGED_OUT', null);

      // Best-effort cleanup cookie
      http.post('/auth/logout').catch(() => { });
    },
  };

  return manager;
}
