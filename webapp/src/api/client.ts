import { createHubSightClient } from '@hubsight/api';

/**
 * The app-wide HubSight REST client. Replaces the old `axiosClient` singleton —
 * the axios instance and the PWA 401/refresh interceptor now live in the SDK.
 *
 * Usage: `import { api } from '../api/client'` then `api.cameras.list()`, etc.
 * The raw axios instance is still reachable at `api.http` if needed.
 */
export const api = createHubSightClient({
  baseUrl: import.meta.env.VITE_API_URL,
});

export default api;
