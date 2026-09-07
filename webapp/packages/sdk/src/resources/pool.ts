import type { InternalHttpClient } from '../internal/http/types';
import type { PoolStatusSummary } from '../types';

export interface PoolResource {
  status(): Promise<PoolStatusSummary>;
}

export function createPoolResource(http: InternalHttpClient): PoolResource {
  return {
    async status(): Promise<PoolStatusSummary> {
      return http.get<PoolStatusSummary>('/pool/status');
    },
  };
}
