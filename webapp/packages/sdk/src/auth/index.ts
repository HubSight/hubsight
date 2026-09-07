/**
 * HubSight Auth Subsystem.
 */

export { createAuthManager } from './manager';
export type {
  AuthManager,
  AuthState,
  Session,
  AuthChangeEvent,
  AuthStateChangeListener,
  Unsubscribe as AuthUnsubscribe,
} from './types';

export {
  LocalStorageSessionAdapter,
  MemorySessionAdapter,
  defaultSessionStorage,
  REFRESH_TOKEN_STORAGE_KEY,
  isPwa,
  getPwaRefreshToken,
  setPwaRefreshToken,
  clearPwaRefreshToken,
  defaultRefreshTokenStore,
  type SessionStorageAdapter,
  type RefreshTokenStore,
} from './storage';
