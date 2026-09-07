import type { AxiosInstance } from 'axios';
import { createHttpClient, type CreateHttpClientOptions } from './http';
import { resolveApiBase } from './config';
import { defaultRefreshTokenStore } from './pwa';
import type { ResourceContext } from './resources/context';
import { createAuthResource, type AuthResource } from './resources/auth';
import { createCamerasResource, type CamerasResource } from './resources/cameras';
import { createMembersResource, type MembersResource } from './resources/members';
import { createNotificationsResource, type NotificationsResource } from './resources/notifications';
import { createDevicesResource, type DevicesResource } from './resources/devices';
import { createArchiveResource, type ArchiveResource } from './resources/archive';
import { createPoolResource, type PoolResource } from './resources/pool';
import { createRecorderResource, type RecorderResource } from './resources/recorder';
import {
  createUsersResource,
  type UsersResource,
  createRolesResource,
  type RolesResource,
  createPermissionsResource,
  type PermissionsResource,
} from './resources/access';

export interface HubSightClientOptions extends CreateHttpClientOptions {
  /**
   * Use an existing axios instance instead of building one. When set, the SDK
   * does NOT install its own 401/refresh interceptor — you own that.
   */
  http?: AxiosInstance;
}

export interface HubSightClient {
  /** The underlying axios instance (escape hatch for endpoints not yet wrapped). */
  readonly http: AxiosInstance;
  /** Resolved REST API base, e.g. `/api`. */
  readonly baseUrl: string;
  readonly auth: AuthResource;
  readonly users: UsersResource;
  readonly roles: RolesResource;
  readonly permissions: PermissionsResource;
  readonly cameras: CamerasResource;
  readonly members: MembersResource;
  readonly notifications: NotificationsResource;
  readonly devices: DevicesResource;
  readonly archive: ArchiveResource;
  readonly pool: PoolResource;
  readonly recorder: RecorderResource;
}

/**
 * Create the HubSight REST client — one object with resource namespaces
 * (`client.cameras.list()`, `client.members.enrollFace(...)`, …).
 */
export function createHubSightClient(options: HubSightClientOptions = {}): HubSightClient {
  const {
    http: providedHttp,
    baseUrl,
    withCredentials = true,
    refreshTokenStore = defaultRefreshTokenStore,
    ...httpOptions
  } = options;

  const resolvedBase = resolveApiBase(baseUrl);
  const http =
    providedHttp ??
    createHttpClient({ baseUrl, withCredentials, refreshTokenStore, ...httpOptions });

  const ctx: ResourceContext = {
    http,
    baseUrl: resolvedBase,
    withCredentials,
    refreshTokenStore,
  };

  return {
    http,
    baseUrl: resolvedBase,
    auth: createAuthResource(ctx),
    users: createUsersResource(ctx),
    roles: createRolesResource(ctx),
    permissions: createPermissionsResource(ctx),
    cameras: createCamerasResource(ctx),
    members: createMembersResource(ctx),
    notifications: createNotificationsResource(ctx),
    devices: createDevicesResource(ctx),
    archive: createArchiveResource(ctx),
    pool: createPoolResource(ctx),
    recorder: createRecorderResource(ctx),
  };
}
