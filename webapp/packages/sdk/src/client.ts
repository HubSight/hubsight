import { createAuthManager } from './auth/manager';
import { defaultSessionStorage, type SessionStorageAdapter } from './auth/storage';
import type { AuthManager } from './auth/types';
import { resolveApiBase } from './config';
import { createInternalHttpClient } from './internal/http/client';
import type { InternalHttpClient } from './internal/http/types';
import { createInternalSocketClient } from './internal/socket/client';
import { createMediaManager } from './media/manager';
import type { MediaManager } from './media/types';
import { createRealtimeManager } from './realtime/manager';
import type { RealtimeManager } from './realtime/types';
import {
  createAccessResource,
  type AccessResource,
  type PermissionsResource,
  type RolesResource,
  type UsersResource,
} from './resources/access';
import { createArchiveResource, type ArchiveResource } from './resources/archive';
import { createCamerasResource, type CamerasResource } from './resources/cameras';
import { createDevicesResource, type DevicesResource } from './resources/devices';
import { createMembersResource, type MembersResource } from './resources/members';
import { createNotificationsResource, type NotificationsResource } from './resources/notifications';
import { createPoolResource, type PoolResource } from './resources/pool';
import { createRecorderResource, type RecorderResource } from './resources/recorder';
import { createClientsResource, type ClientsResource } from './resources/clients';
import {
  createGoogleServiceAccountsResource,
  type GoogleServiceAccountsResource,
} from './resources/google-service-accounts';
import {
  createAppConfigsResource,
  type AppConfigsResource,
  type MobileConfigsResource,
} from './resources/app-configs';

export interface BaseClientOptions {
  /** REST API base URL, e.g. `/api` or `http://localhost:8088/api` (default: `/api`) */
  baseUrl?: string;
  /** Send credentials/cookies with HTTP requests (default: true) */
  withCredentials?: boolean;
  /** Custom session storage adapter for PWA refresh tokens (default: localStorage) */
  sessionStorage?: SessionStorageAdapter;
  /** Default timeout for HTTP requests in ms (default: 15000) */
  timeoutMs?: number;
  /** Client API Key for application authorization (default: 'hs_web_client_core') */
  apiKey?: string;
  /** Optional bearer token for non-cookie environments */
  token?: string | (() => string | undefined | null);
}

export interface BaseClient {
  readonly baseUrl: string;
  readonly http: InternalHttpClient;
  readonly auth: AuthManager;
  destroy(): void;
}

export interface HubSightClientOptions extends BaseClientOptions {
  /** Automatically connect realtime Socket.IO on client creation (default: true) */
  autoConnectRealtime?: boolean;
}

export interface HubSightClient extends BaseClient {
  // ── Core Managers ────────────────────────────────────────────────────────────
  readonly realtime: RealtimeManager;
  readonly media: MediaManager;

  // ── REST Resources ───────────────────────────────────────────────────────────
  readonly cameras: CamerasResource;
  readonly devices: DevicesResource;
  readonly members: MembersResource;
  readonly notifications: NotificationsResource;
  readonly archive: ArchiveResource;
  readonly access: AccessResource;
  readonly users: UsersResource;
  readonly roles: RolesResource;
  readonly permissions: PermissionsResource;
  readonly pool: PoolResource;
  readonly recorder: RecorderResource;
  readonly clients: ClientsResource;
  readonly googleServiceAccounts: GoogleServiceAccountsResource;
  readonly appConfigs: AppConfigsResource;
  readonly mobileConfigs: MobileConfigsResource;
}

/**
 * Creates a lightweight, tree-shakable Base HubSight Client.
 *
 * Encapsulates only HTTP transport and Auth lifecycle without pulling in
 * Socket.IO or WebRTC dependencies.
 */
export function createBaseClient(options: BaseClientOptions = {}): BaseClient {
  const {
    baseUrl,
    withCredentials = true,
    sessionStorage = defaultSessionStorage,
    timeoutMs = 15000,
  } = options;

  const resolvedBase = resolveApiBase(baseUrl);
  let authManagerRef: AuthManager | null = null;

  const http: InternalHttpClient = createInternalHttpClient({
    baseUrl: resolvedBase,
    withCredentials,
    timeoutMs,
    apiKey: options.apiKey,
    token: options.token,
    onRefreshAuth: async () => {
      if (!authManagerRef) return false;
      return authManagerRef.refreshSession();
    },
    onSessionExpired: () => {
      authManagerRef?.logout();
    },
  });

  const auth = createAuthManager({
    http,
    storage: sessionStorage,
  });
  authManagerRef = auth;

  return {
    baseUrl: resolvedBase,
    http,
    auth,
    destroy(): void {},
  };
}

/**
 * Creates a unified HubSight SDK Client instance.
 *
 * Encapsulates:
 * - HTTP transport (with silent 401 token refresh queue and standard error hierarchy)
 * - Auth lifecycle (session state machine, PWA storage, force logout handling)
 * - Realtime Socket.IO bus (strongly typed built-in events, auto-reconnection)
 * - WebRTC media engine (SDP exchange, jitter buffer, 15s pool heartbeat, lease release)
 * - Domain REST resources (with lazy initialization on first access)
 */
export function createHubSightClient(options: HubSightClientOptions = {}): HubSightClient {
  const base = createBaseClient(options);
  const {
    autoConnectRealtime = true,
    token,
    apiKey = options.apiKey || 'hs_web_client_core',
  } = options;

  let realtimeRef: RealtimeManager | null = null;
  const getRealtime = (): RealtimeManager => {
    if (!realtimeRef) {
      const socketClient = createInternalSocketClient({
        baseUrl: base.baseUrl,
        withCredentials: options.withCredentials ?? true,
        autoConnect: autoConnectRealtime,
        token,
        apiKey,
      });
      realtimeRef = createRealtimeManager({ socket: socketClient });

      realtimeRef.onForceLogout((payload) => {
        const currentUser = base.auth.getUser();
        if (!currentUser || (payload?.userId && currentUser.id === payload.userId)) {
          base.auth.handleForceLogout(payload?.reason, payload?.message);
        }
      });
    }
    return realtimeRef;
  };

  if (autoConnectRealtime) {
    getRealtime();
  }

  let mediaRef: MediaManager | null = null;
  let camerasRef: CamerasResource | null = null;
  let devicesRef: DevicesResource | null = null;
  let membersRef: MembersResource | null = null;
  let notificationsRef: NotificationsResource | null = null;
  let archiveRef: ArchiveResource | null = null;
  let accessRef: AccessResource | null = null;
  let poolRef: PoolResource | null = null;
  let recorderRef: RecorderResource | null = null;
  let clientsRef: ClientsResource | null = null;
  let googleServiceAccountsRef: GoogleServiceAccountsResource | null = null;
  let appConfigsRef: AppConfigsResource | null = null;

  return {
    baseUrl: base.baseUrl,
    http: base.http,
    auth: base.auth,

    get realtime() {
      return getRealtime();
    },
    get media() {
      return (mediaRef ??= createMediaManager({ http: base.http }));
    },
    get cameras() {
      return (camerasRef ??= createCamerasResource(base.http));
    },
    get devices() {
      return (devicesRef ??= createDevicesResource(base.http));
    },
    get members() {
      return (membersRef ??= createMembersResource(base.http));
    },
    get notifications() {
      return (notificationsRef ??= createNotificationsResource(base.http));
    },
    get archive() {
      return (archiveRef ??= createArchiveResource(base.http, base.baseUrl));
    },
    get access() {
      return (accessRef ??= createAccessResource(base.http));
    },
    get users() {
      return this.access.users;
    },
    get roles() {
      return this.access.roles;
    },
    get permissions() {
      return this.access.permissions;
    },
    get pool() {
      return (poolRef ??= createPoolResource(base.http));
    },
    get recorder() {
      return (recorderRef ??= createRecorderResource(base.http));
    },
    get clients() {
      return (clientsRef ??= createClientsResource(base.http));
    },
    get googleServiceAccounts() {
      return (googleServiceAccountsRef ??= createGoogleServiceAccountsResource(base.http));
    },
    get appConfigs() {
      return (appConfigsRef ??= createAppConfigsResource(base.http, base.baseUrl));
    },
    get mobileConfigs() {
      return (appConfigsRef ??= createAppConfigsResource(base.http, base.baseUrl));
    },

    destroy(): void {
      realtimeRef?.close();
      base.destroy();
    },
  };
}
