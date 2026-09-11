import type {
  ChangePasswordRequest,
  ClientDeviceInfo,
  Locale,
  LoginRequest,
  LoginResponse,
  PasskeyItem,
  SessionItem,
  ThemePreference,
  TwoFactorSetupResponse,
  TwoFactorVerifyRequest,
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
  setTheme(theme: ThemePreference): Promise<void>;
  setPreferences(preferences: Record<string, boolean>): Promise<void>;

  // Two-Factor Authentication (2FA)
  setup2FA(): Promise<TwoFactorSetupResponse>;
  enable2FA(code: string): Promise<void>;
  disable2FA(password?: string, code?: string): Promise<void>;
  regenerateRecoveryCodes(password: string): Promise<string[]>;
  verify2FA(payload: TwoFactorVerifyRequest): Promise<LoginResponse>;

  // Passkey / WebAuthn
  listPasskeys(): Promise<PasskeyItem[]>;
  registerPasskey(name: string): Promise<PasskeyItem>;
  renamePasskey(id: string, name: string): Promise<void>;
  deletePasskey(id: string): Promise<void>;
  loginWithPasskey(username: string, conditional?: boolean, deviceInfo?: Partial<ClientDeviceInfo>): Promise<LoginResponse>;

  // Session & Device Management
  listSessions(): Promise<SessionItem[]>;
  revokeSession(id: string): Promise<void>;
  revokeAllOtherSessions(): Promise<void>;

  // Internal kernel handler for realtime kickout
  handleForceLogout(reason?: string, message?: string): void;
}

