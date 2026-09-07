/**
 * HubSight SDK Error Hierarchy.
 *
 * All errors thrown or emitted by the SDK inherit from {@link HubSightError},
 * completely eliminating raw AxiosError, DOMException, or Socket.IO errors.
 */

export interface HubSightErrorOptions {
  code?: string;
  cause?: unknown;
}

export class HubSightError extends Error {
  readonly code: string;
  override readonly cause?: unknown;

  constructor(message: string, options: HubSightErrorOptions = {}) {
    super(message);
    this.name = 'HubSightError';
    this.code = options.code ?? 'HUBSIGHT_ERROR';
    this.cause = options.cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface HubSightApiErrorOptions extends HubSightErrorOptions {
  status?: number;
  data?: unknown;
}

export class HubSightApiError extends HubSightError {
  readonly status: number;
  readonly data: unknown;

  constructor(message: string, options: HubSightApiErrorOptions = {}) {
    super(message, { ...options, code: options.code ?? `API_${options.status ?? 500}` });
    this.name = 'HubSightApiError';
    this.status = options.status ?? 500;
    this.data = options.data;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }

  get isServerError(): boolean {
    return this.status >= 500 && this.status < 600;
  }

  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

export class AuthenticationError extends HubSightApiError {
  constructor(message = 'Authentication required', options: Omit<HubSightApiErrorOptions, 'status'> = {}) {
    super(message, { ...options, status: 401, code: options.code ?? 'UNAUTHENTICATED' });
    this.name = 'AuthenticationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ForbiddenError extends HubSightApiError {
  constructor(message = 'Access forbidden', options: Omit<HubSightApiErrorOptions, 'status'> = {}) {
    super(message, { ...options, status: 403, code: options.code ?? 'FORBIDDEN' });
    this.name = 'ForbiddenError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NotFoundError extends HubSightApiError {
  constructor(message = 'Resource not found', options: Omit<HubSightApiErrorOptions, 'status'> = {}) {
    super(message, { ...options, status: 404, code: options.code ?? 'NOT_FOUND' });
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ConflictError extends HubSightApiError {
  constructor(message = 'Resource conflict', options: Omit<HubSightApiErrorOptions, 'status'> = {}) {
    super(message, { ...options, status: 409, code: options.code ?? 'CONFLICT' });
    this.name = 'ConflictError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface ValidationErrorOptions extends Omit<HubSightApiErrorOptions, 'status'> {
  details?: Record<string, string>;
}

export class ValidationError extends HubSightApiError {
  readonly details?: Record<string, string>;

  constructor(message = 'Validation failed', options: ValidationErrorOptions = {}) {
    super(message, { ...options, status: 400, code: options.code ?? 'VALIDATION_FAILED' });
    this.name = 'ValidationError';
    this.details = options.details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface NetworkErrorOptions extends HubSightErrorOptions {
  isTimeout?: boolean;
  isOffline?: boolean;
}

export class HubSightNetworkError extends HubSightError {
  readonly isTimeout: boolean;
  readonly isOffline: boolean;

  constructor(message = 'Network connection failed', options: NetworkErrorOptions = {}) {
    super(message, { ...options, code: options.code ?? (options.isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR') });
    this.name = 'HubSightNetworkError';
    this.isTimeout = Boolean(options.isTimeout);
    this.isOffline = Boolean(options.isOffline);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class HubSightRealtimeError extends HubSightError {
  constructor(message: string, options: HubSightErrorOptions = {}) {
    super(message, { ...options, code: options.code ?? 'REALTIME_ERROR' });
    this.name = 'HubSightRealtimeError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class HubSightMediaError extends HubSightError {
  constructor(message: string, options: HubSightErrorOptions = {}) {
    super(message, { ...options, code: options.code ?? 'MEDIA_ERROR' });
    this.name = 'HubSightMediaError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Type guard to check if an unknown error is any HubSightError. */
export function isHubSightError(err: unknown): err is HubSightError {
  return err instanceof HubSightError;
}

/** Type guard to check if an unknown error is an API error (optionally filtering by status). */
export function isApiError(err: unknown, status?: number): err is HubSightApiError {
  if (!(err instanceof HubSightApiError)) return false;
  return status === undefined || err.status === status;
}

/** Extracts a clean human-readable message from any unknown error. */
export function getErrorMessage(err: unknown, fallback = 'Operation failed'): string {
  if (err instanceof HubSightError && err.message) {
    return err.message;
  }
  if (typeof err === 'object' && err !== null) {
    const obj = err as Record<string, unknown>;
    if (typeof obj['message'] === 'string' && obj['message']) {
      return obj['message'];
    }
    if (typeof obj['error'] === 'string' && obj['error']) {
      return obj['error'];
    }
  }
  if (typeof err === 'string' && err.trim().length > 0) {
    return err;
  }
  return fallback;
}
