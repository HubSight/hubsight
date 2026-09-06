/**
 * URL resolution shared by the event bus and the live-stream signaling.
 *
 * The webapp passes a single `baseUrl` — the REST API root, e.g. `/api` (same
 * origin) or `http://localhost:8088/api` (dev). The Socket.IO server lives one
 * level up from `/api` at `<origin>/relay`, matching the old SocketContext:
 *   `import.meta.env.VITE_API_URL?.replace(/\/api$/, '')`
 */

/** The REST API base, e.g. `/api` or `https://host/api`. Trailing slash stripped. */
export function resolveApiBase(baseUrl?: string): string {
  const b = (baseUrl && baseUrl.trim()) || '/api';
  return b.replace(/\/+$/, '');
}

/** The Socket.IO server origin — API base with a trailing `/api` removed. */
export function resolveSocketOrigin(baseUrl?: string): string {
  const origin = resolveApiBase(baseUrl).replace(/\/api$/, '');
  return origin || '/';
}

export const RELAY_PATH = '/relay';
