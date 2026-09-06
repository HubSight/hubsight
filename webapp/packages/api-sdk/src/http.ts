import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import { resolveApiBase } from './config';
import { defaultRefreshTokenStore, type RefreshTokenStore } from './pwa';

export interface CreateHttpClientOptions {
  /** REST API base, e.g. `/api` or `https://host/api`. Defaults to `/api`. */
  baseUrl?: string;
  /** Send cookies with every request. Default `true` (HubSight auth is cookie-based). */
  withCredentials?: boolean;
  /** Refresh-token persistence for installed-PWA sessions. Defaults to `localStorage`. */
  refreshTokenStore?: RefreshTokenStore;
  /**
   * Called when a refresh attempt fails (session is unrecoverable). The webapp
   * uses this to drop the user back to the login screen.
   */
  onSessionExpired?: () => void;
  /** Extra axios config merged into the instance. */
  axiosConfig?: AxiosRequestConfig;
}

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

/**
 * Build the shared axios instance. Mirrors the old `webapp/src/api/axiosClient.ts`:
 * on a 401 (that is not itself a login/refresh call) while running as a PWA with a
 * stored refresh token, it silently `POST /auth/refresh`es, updates the token, and
 * replays the original request — queueing concurrent 401s behind the one refresh.
 */
export function createHttpClient(options: CreateHttpClientOptions = {}): AxiosInstance {
  const {
    baseUrl,
    withCredentials = true,
    refreshTokenStore = defaultRefreshTokenStore,
    onSessionExpired,
    axiosConfig,
  } = options;

  const baseURL = resolveApiBase(baseUrl);
  const instance = axios.create({ baseURL, withCredentials, ...axiosConfig });

  let isRefreshing = false;
  let queue: Array<{ resolve: () => void; reject: (reason?: unknown) => void }> = [];

  const flushQueue = (error: Error | null) => {
    for (const p of queue) {
      if (error) p.reject(error);
      else p.resolve();
    }
    queue = [];
  };

  instance.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const original = error.config as RetriableConfig | undefined;
      const url = original?.url || '';

      const isAuthLoop = url.includes('/auth/refresh') || url.includes('/auth/login');
      if (
        error.response?.status !== 401 ||
        !original ||
        original._retry ||
        isAuthLoop ||
        !refreshTokenStore.isPwa()
      ) {
        return Promise.reject(error);
      }

      const storedRefreshToken = refreshTokenStore.get();
      if (!storedRefreshToken) {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise<void>((resolve, reject) => {
          queue.push({ resolve, reject });
        }).then(() => instance(original));
      }

      original._retry = true;
      isRefreshing = true;

      try {
        const refreshRes = await axios.post(
          `${baseURL}/auth/refresh`,
          { refresh_token: storedRefreshToken },
          { withCredentials },
        );
        const next = (refreshRes.data as { refresh_token?: string })?.refresh_token;
        if (next) refreshTokenStore.set(next);

        flushQueue(null);
        return instance(original);
      } catch (refreshErr) {
        refreshTokenStore.clear();
        flushQueue(new Error('Session refresh failed'));
        onSessionExpired?.();
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    },
  );

  return instance;
}
