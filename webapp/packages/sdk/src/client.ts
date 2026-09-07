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

export interface HubSightClientOptions {
  /** REST API base URL, e.g. `/api` or `http://localhost:8088/api` (default: `/api`) */
  baseUrl?: string;
  /** Send credentials/cookies with HTTP and WebSocket requests (default: true) */
  withCredentials?: boolean;
  /** Automatically connect realtime Socket.IO on client creation (default: true) */
  autoConnectRealtime?: boolean;
  /** Custom session storage adapter for PWA refresh tokens (default: localStorage) */
  sessionStorage?: SessionStorageAdapter;
  /** Default timeout for HTTP requests in ms (default: 15000) */
  timeoutMs?: number;
  /** Optional bearer token for non-cookie environments */
  token?: string | (() => string | undefined | null);
}

export interface HubSightClient {
  readonly baseUrl: string;

  // ── Core Managers ────────────────────────────────────────────────────────────
  readonly auth: AuthManager;
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

  destroy(): void;
}

/**
 * Creates a unified HubSight SDK Client instance.
 *
 * Encapsulates:
 * - HTTP transport (with silent 401 token refresh queue and standard error hierarchy)
 * - Auth lifecycle (session state machine, PWA storage, force logout handling)
 * - Realtime Socket.IO bus (strongly typed built-in events, auto-reconnection)
 * - WebRTC media engine (SDP exchange, jitter buffer, 15s pool heartbeat, lease release)
 */
export function createHubSightClient(options: HubSightClientOptions = {}): HubSightClient {
  const {
    baseUrl,
    withCredentials = true,
    autoConnectRealtime = true,
    sessionStorage = defaultSessionStorage,
    timeoutMs = 15000,
    token,
  } = options;

  const resolvedBase = resolveApiBase(baseUrl);

  // 1. Auth Manager placeholder to link with HTTP client
  let authManagerRef: AuthManager | null = null;

  // 2. Internal HTTP Transport
  const http: InternalHttpClient = createInternalHttpClient({
    baseUrl: resolvedBase,
    withCredentials,
    timeoutMs,
    onRefreshAuth: async () => {
      if (!authManagerRef) return false;
      return authManagerRef.refreshSession();
    },
    onSessionExpired: () => {
      authManagerRef?.logout();
    },
  });

  // 3. Auth Manager instantiation
  const auth = createAuthManager({
    http,
    storage: sessionStorage,
  });
  authManagerRef = auth;

  // 4. Internal Socket Client & Realtime Manager
  const socketClient = createInternalSocketClient({
    baseUrl: resolvedBase,
    withCredentials,
    autoConnect: autoConnectRealtime,
    token,
  });
  const realtime = createRealtimeManager({ socket: socketClient });

  // 5. Wire Realtime force logout directly to Auth Manager
  realtime.onForceLogout((payload) => {
    const currentUser = auth.getUser();
    if (!currentUser || (payload?.userId && currentUser.id === payload.userId)) {
      auth.handleForceLogout(payload?.reason, payload?.message);
    }
  });

  // 6. Media Manager (WebRTC)
  const media = createMediaManager({ http });

  // 7. REST Resources
  const cameras = createCamerasResource(http);
  const devices = createDevicesResource(http);
  const members = createMembersResource(http);
  const notifications = createNotificationsResource(http);
  const archive = createArchiveResource(http, resolvedBase);
  const access = createAccessResource(http);
  const pool = createPoolResource(http);
  const recorder = createRecorderResource(http);

  return {
    baseUrl: resolvedBase,
    auth,
    realtime,
    media,
    cameras,
    devices,
    members,
    notifications,
    archive,
    access,
    users: access.users,
    roles: access.roles,
    permissions: access.permissions,
    pool,
    recorder,

    destroy(): void {
      realtime.close();
    },
  };
}
