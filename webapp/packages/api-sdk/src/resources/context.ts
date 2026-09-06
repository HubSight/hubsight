import type { AxiosInstance } from 'axios';
import type { RefreshTokenStore } from '../pwa';

/** Shared state every resource group receives from {@link createHubSightClient}. */
export interface ResourceContext {
  http: AxiosInstance;
  /** Resolved REST API base, e.g. `/api` — for building asset URLs. */
  baseUrl: string;
  withCredentials: boolean;
  refreshTokenStore: RefreshTokenStore;
}
