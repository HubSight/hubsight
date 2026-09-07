import { createHubSightClient } from '@hubsight/sdk';

/**
 * The app-wide HubSight client.
 * Provides unified, fully encapsulated access to Auth, Realtime, Media, and REST resources.
 *
 * Usage: `import { api } from '../api/client'` then `api.cameras.list()`, `api.auth.me()`, etc.
 */
export const api = createHubSightClient({
  baseUrl: import.meta.env.VITE_API_URL,
});

export default api;
