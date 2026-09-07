import type {
  ChangePasswordRequest,
  Locale,
  LoginRequest,
  LoginResponse,
  User,
} from '../types';

export type AuthState = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

export type AuthChangeEvent =
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'TOKEN_REFRESHED'
  | 'FORCE_LOGGED_OUT'
  | 'USER_UPDATED';

export interface Session {
  user: User;
  token?: string;
  isPwa: boolean;
  expiresAt?: Date;
}

export type Unsubscribe = () => void;

export type AuthStateChangeListener = (event: AuthChangeEvent, session: Session | null) => void;

export interface AuthManager {
  readonly state: AuthState;
  getUser(): User | null;
  getSession(): Session | null;
  isAuthenticated(): boolean;
  can(...permissions: string[]): boolean;
  onAuthStateChange(listener: AuthStateChangeListener): Unsubscribe;

  // Actions
  login(credentials: LoginRequest): Promise<LoginResponse>;
  logout(): Promise<void>;
  me(): Promise<User>;
  refreshSession(): Promise<boolean>;
  verifyPassword(password: string): Promise<boolean>;
  changePassword(body: ChangePasswordRequest): Promise<void>;
  setLocale(locale: Locale): Promise<void>;
  setTimezone(timezone: string): Promise<void>;
  setPreferences(preferences: Record<string, boolean>): Promise<void>;

  // Internal kernel handler for realtime kickout
  handleForceLogout(reason?: string, message?: string): void;
}
