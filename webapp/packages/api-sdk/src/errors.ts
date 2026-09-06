import { AxiosError } from 'axios';

/**
 * A normalised HubSight API error. The gateway returns `{ error: "message" }`
 * bodies; this surfaces that string plus the HTTP status, while keeping the
 * original AxiosError reachable via {@link HubSightApiError.cause}.
 */
export class HubSightApiError extends Error {
  readonly status: number | undefined;
  readonly data: unknown;
  override readonly cause: unknown;

  constructor(message: string, opts: { status?: number; data?: unknown; cause?: unknown } = {}) {
    super(message);
    this.name = 'HubSightApiError';
    this.status = opts.status;
    this.data = opts.data;
    this.cause = opts.cause;
  }
}

/** Extract a human message from an axios error's `{ error }` / `{ message }` body. */
export function apiErrorMessage(err: unknown, fallback = 'Request failed'): string {
  if (err instanceof HubSightApiError) return err.message;
  if (err instanceof AxiosError) {
    const body = err.response?.data as { error?: unknown; message?: unknown } | undefined;
    if (body && typeof body.error === 'string' && body.error) return body.error;
    if (body && typeof body.message === 'string' && body.message) return body.message;
    return err.message || fallback;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export function toApiError(err: unknown, fallback?: string): HubSightApiError {
  if (err instanceof HubSightApiError) return err;
  const status = err instanceof AxiosError ? err.response?.status : undefined;
  const data = err instanceof AxiosError ? err.response?.data : undefined;
  return new HubSightApiError(apiErrorMessage(err, fallback), { status, data, cause: err });
}
