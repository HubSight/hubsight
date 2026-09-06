/**
 * `@hubsight/api` — framework-agnostic REST client for the HubSight gateway.
 *
 * ```ts
 * import { createHubSightClient } from '@hubsight/api';
 * const api = createHubSightClient({ baseUrl: '/api' });
 * const cams = await api.cameras.list();
 * ```
 *
 * React bindings live at `@hubsight/api/react`.
 */
export { createHubSightClient } from './client';
export type { HubSightClient, HubSightClientOptions } from './client';

export { createHttpClient } from './http';
export type { CreateHttpClientOptions } from './http';

export { HubSightApiError, apiErrorMessage, toApiError } from './errors';

export { resolveApiBase } from './config';

export {
  isPwa,
  getPwaRefreshToken,
  setPwaRefreshToken,
  clearPwaRefreshToken,
  defaultRefreshTokenStore,
} from './pwa';
export type { RefreshTokenStore } from './pwa';

export type { AuthResource } from './resources/auth';
export type { CamerasResource } from './resources/cameras';
export type { MembersResource } from './resources/members';
export type { NotificationsResource } from './resources/notifications';
export type { DevicesResource } from './resources/devices';
export type { ArchiveResource } from './resources/archive';
export type { PoolResource } from './resources/pool';
export type { RecorderResource } from './resources/recorder';

export * from './types';
