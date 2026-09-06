import type { ResourceContext } from './context';
import type { ScanJob } from '../types';

export interface DevicesResource {
  /** `POST /devices/scan` — start an LAN camera discovery job. */
  startScan(extraCidrs?: string[]): Promise<ScanJob>;
  /** `GET /devices/scan/:id` — poll job progress. */
  getScan(jobId: string): Promise<ScanJob>;
}

export function createDevicesResource(ctx: ResourceContext): DevicesResource {
  const { http } = ctx;

  return {
    async startScan(extraCidrs = []) {
      const res = await http.post<ScanJob>('/devices/scan', { extra_cidrs: extraCidrs });
      return res.data;
    },

    async getScan(jobId) {
      const res = await http.get<ScanJob>(`/devices/scan/${jobId}`);
      return res.data;
    },
  };
}
