import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import {
  AuthenticationError,
  ConflictError,
  ForbiddenError,
  HubSightApiError,
  HubSightError,
  HubSightNetworkError,
  NotFoundError,
  ValidationError,
} from '../../errors';
import type {
  InternalHttpClient,
  RawRequestOptions,
  RawResponse,
  RequestOptions,
} from './types';

export interface HttpClientOptions {
  baseUrl: string;
  withCredentials?: boolean;
  timeoutMs?: number;
  /** Hook called by AuthManager to perform silent token refresh on 401 */
  onRefreshAuth?: () => Promise<boolean>;
  /** Hook called when a session is unrecoverable */
  onSessionExpired?: () => void;
}

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

function mapAxiosError(error: unknown): HubSightError {
  if (error instanceof HubSightError) {
    return error;
  }

  if (error instanceof AxiosError) {
    const status = error.response?.status;
    const data = error.response?.data;

    let message = 'Request failed';
    if (data && typeof data === 'object') {
      const d = data as Record<string, unknown>;
      if (typeof d['error'] === 'string' && d['error']) {
        message = d['error'];
      } else if (typeof d['message'] === 'string' && d['message']) {
        message = d['message'];
      }
    } else if (error.message) {
      message = error.message;
    }

    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      return new HubSightNetworkError('Request timed out', {
        cause: error,
        isTimeout: true,
      });
    }

    if (!error.response) {
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      return new HubSightNetworkError(message || 'Network connection failed', {
        cause: error,
        isOffline,
      });
    }

    switch (status) {
      case 401:
        return new AuthenticationError(message, { cause: error, data });
      case 403:
        return new ForbiddenError(message, { cause: error, data });
      case 404:
        return new NotFoundError(message, { cause: error, data });
      case 409:
        return new ConflictError(message, { cause: error, data });
      case 400:
      case 422:
        return new ValidationError(message, {
          cause: error,
          data,
          details: typeof data === 'object' && data !== null ? (data as Record<string, string>) : undefined,
        });
      default:
        return new HubSightApiError(message, { status, data, cause: error });
    }
  }

  return new HubSightError(
    error instanceof Error ? error.message : 'An unexpected error occurred',
    { cause: error },
  );
}

export function createInternalHttpClient(options: HttpClientOptions): InternalHttpClient {
  const {
    baseUrl,
    withCredentials = true,
    timeoutMs = 15000,
    onRefreshAuth,
    onSessionExpired,
  } = options;

  const instance: AxiosInstance = axios.create({
    baseURL: baseUrl,
    withCredentials,
    timeout: timeoutMs,
    headers: {
      Accept: 'application/json',
    },
  });

  let isRefreshing = false;
  let refreshQueue: Array<{ resolve: () => void; reject: (err: unknown) => void }> = [];

  const flushQueue = (err: unknown | null) => {
    for (const item of refreshQueue) {
      if (err) item.reject(err);
      else item.resolve();
    }
    refreshQueue = [];
  };

  instance.interceptors.response.use(
    (response) => response,
    async (error: unknown) => {
      if (!(error instanceof AxiosError)) {
        return Promise.reject(mapAxiosError(error));
      }

      const original = error.config as RetriableConfig | undefined;
      const url = original?.url || '';
      const isAuthEndpoint = url.includes('/auth/refresh') || url.includes('/auth/login');

      if (
        error.response?.status !== 401 ||
        !original ||
        original._retry ||
        isAuthEndpoint ||
        !onRefreshAuth
      ) {
        return Promise.reject(mapAxiosError(error));
      }

      if (isRefreshing) {
        return new Promise<void>((resolve, reject) => {
          refreshQueue.push({ resolve, reject });
        })
          .then(() => instance(original))
          .catch((retryErr) => Promise.reject(mapAxiosError(retryErr)));
      }

      original._retry = true;
      isRefreshing = true;

      try {
        const refreshed = await onRefreshAuth();
        if (!refreshed) {
          flushQueue(new Error('Session refresh denied'));
          onSessionExpired?.();
          return Promise.reject(mapAxiosError(error));
        }

        flushQueue(null);
        return instance(original);
      } catch (refreshErr) {
        flushQueue(refreshErr);
        onSessionExpired?.();
        return Promise.reject(mapAxiosError(refreshErr));
      } finally {
        isRefreshing = false;
      }
    },
  );

  const request = async <T>(config: AxiosRequestConfig): Promise<T> => {
    try {
      const res = await instance.request<T>(config);
      return res.data;
    } catch (err) {
      throw mapAxiosError(err);
    }
  };

  return {
    get<T>(path: string, opts?: RequestOptions): Promise<T> {
      return request<T>({
        method: 'GET',
        url: path,
        params: opts?.params,
        headers: opts?.headers,
        timeout: opts?.timeoutMs,
        signal: opts?.signal,
      });
    },

    post<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
      return request<T>({
        method: 'POST',
        url: path,
        data: body,
        params: opts?.params,
        headers: opts?.headers,
        timeout: opts?.timeoutMs,
        signal: opts?.signal,
      });
    },

    put<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
      return request<T>({
        method: 'PUT',
        url: path,
        data: body,
        params: opts?.params,
        headers: opts?.headers,
        timeout: opts?.timeoutMs,
        signal: opts?.signal,
      });
    },

    patch<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
      return request<T>({
        method: 'PATCH',
        url: path,
        data: body,
        params: opts?.params,
        headers: opts?.headers,
        timeout: opts?.timeoutMs,
        signal: opts?.signal,
      });
    },

    delete<T>(path: string, opts?: RequestOptions): Promise<T> {
      return request<T>({
        method: 'DELETE',
        url: path,
        data: opts?.body,
        params: opts?.params,
        headers: opts?.headers,
        timeout: opts?.timeoutMs,
        signal: opts?.signal,
      });
    },

    async requestRaw(path: string, opts: RawRequestOptions): Promise<RawResponse> {
      try {
        const res = await instance.request({
          method: opts.method ?? 'GET',
          url: path,
          data: opts.body,
          params: opts.params,
          headers: opts.headers,
          timeout: opts.timeoutMs,
          signal: opts.signal,
          responseType: 'text',
        });

        const headers: Record<string, string> = {};
        if (res.headers) {
          for (const [k, v] of Object.entries(res.headers)) {
            if (typeof v === 'string') headers[k.toLowerCase()] = v;
          }
        }

        return {
          status: res.status,
          ok: res.status >= 200 && res.status < 300,
          headers,
          text: async () => (typeof res.data === 'string' ? res.data : JSON.stringify(res.data)),
          json: async <R>() => (typeof res.data === 'string' ? JSON.parse(res.data) : res.data) as R,
        };
      } catch (err) {
        throw mapAxiosError(err);
      }
    },
  };
}
