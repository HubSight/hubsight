import type { ResourceContext } from './context';
import type { PoolStatusSummary } from '../types';

export interface PoolResource {
  /** `GET /pool/status` — the full connection-pool snapshot. */
  status(): Promise<PoolStatusSummary>;
}

export function createPoolResource(ctx: ResourceContext): PoolResource {
  const { http } = ctx;

  return {
    async status() {
      const res = await http.get<PoolStatusSummary>('/pool/status');
      return res.data;
    },
  };
}
