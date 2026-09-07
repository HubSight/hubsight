/**
 * HubSight URL and Origin resolution utilities.
 */

export const DEFAULT_API_BASE = '/api';
export const RELAY_PATH = '/relay';

/**
 * Normalises an API base URL (defaults to `/api`).
 * Strips trailing slashes.
 */
export function resolveApiBase(baseUrl?: string): string {
  if (!baseUrl || baseUrl === '/') return DEFAULT_API_BASE;
  return baseUrl.replace(/\/+$/, '');
}

/**
 * Derives the Socket.IO origin from an API base URL.
 * E.g. `http://localhost:8088/api` -> `http://localhost:8088`
 * or `/api` -> window.location.origin (or `/`).
 */
export function resolveSocketOrigin(baseUrl?: string): string {
  const base = resolveApiBase(baseUrl);
  if (/^https?:\/\//i.test(base)) {
    try {
      const parsed = new URL(base);
      return parsed.origin;
    } catch {
      return base.replace(/\/api\/?$/, '');
    }
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return '';
}

