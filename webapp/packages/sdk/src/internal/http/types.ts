/**
 * Internal HTTP Transport contracts.
 * Strictly internal to the SDK — no Axios types leak past here.
 */

export interface RequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface RawRequestOptions extends RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  keepalive?: boolean;
}

export interface RawResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly headers: Record<string, string>;
  text(): Promise<string>;
  json<T>(): Promise<T>;
}

export interface InternalHttpClient {
  get<T>(path: string, options?: RequestOptions): Promise<T>;
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  delete<T>(path: string, options?: RequestOptions): Promise<T>;
  requestRaw(path: string, options: RawRequestOptions): Promise<RawResponse>;
}
