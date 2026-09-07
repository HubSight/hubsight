import { useCallback, useEffect, useState } from 'react';
import type { Session } from '../auth/types';
import type {
  ChangePasswordRequest,
  LoginRequest,
  LoginResponse,
  User,
} from '../types';
import { useHubSight } from './provider';

export interface UseAuthResult {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  can(...permissions: string[]): boolean;
  login(credentials: LoginRequest): Promise<LoginResponse>;
  logout(): Promise<void>;
  checkAuth(): Promise<User | null>;
  setUser(user: User | null): void;
  changePassword(body: ChangePasswordRequest): Promise<void>;
}

export function useAuth(): UseAuthResult {
  const client = useHubSight();
  const auth = client.auth;

  const [user, setUserState] = useState<User | null>(auth.getUser());
  const [session, setSessionState] = useState<Session | null>(auth.getSession());
  const [isLoading, setIsLoading] = useState<boolean>(!auth.getUser());

  useEffect(() => {
    const unsub = auth.onAuthStateChange((_event, newSession) => {
      setUserState(newSession?.user ?? null);
      setSessionState(newSession);
      setIsLoading(false);
    });

    // If initial user isn't loaded yet, fetch once
    if (!auth.getUser()) {
      auth
        .me()
        .catch(() => {
          /* ignore 401 unauthenticated on initial load */
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setIsLoading(false);
    }

    return () => {
      unsub();
    };
  }, [auth]);

  const can = useCallback(
    (...permissions: string[]) => auth.can(...permissions),
    [auth, user?.role, user?.permissions],
  );

  const login = useCallback(
    async (credentials: LoginRequest) => {
      const res = await auth.login(credentials);
      return res;
    },
    [auth],
  );

  const logout = useCallback(async () => {
    await auth.logout();
  }, [auth]);

  const checkAuth = useCallback(async () => {
    try {
      setIsLoading(true);
      return await auth.me();
    } catch {
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [auth]);

  const setUser = useCallback(
    (nextUser: User | null) => {
      setUserState(nextUser);
    },
    [],
  );

  const changePassword = useCallback(
    async (body: ChangePasswordRequest) => {
      await auth.changePassword(body);
    },
    [auth],
  );

  return {
    user,
    session,
    isLoading,
    isAuthenticated: Boolean(user),
    can,
    login,
    logout,
    checkAuth,
    setUser,
    changePassword,
  };
}
