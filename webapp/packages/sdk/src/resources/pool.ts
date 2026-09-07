import type { InternalHttpClient } from '../internal/http/types';
import type { PoolStatusSummary } from '../types';
import { resolveHttpClient, type HttpLike } from './context';

export interface PoolResource {
  status(): Promise<PoolStatusSummary>;
}

// ── Standalone Tree-Shakable Functions ───────────────────────────────────────

export async function getPoolStatus(client: HttpLike): Promise<PoolStatusSummary> {
  const http = resolveHttpClient(client);
  return http.get<PoolStatusSummary>('/pool/status');
}

// ── Resource Factory ─────────────────────────────────────────────────────────

export function createPoolResource(http: InternalHttpClient): PoolResource {
  return {
    status: () => getPoolStatus(http),
  };
}
