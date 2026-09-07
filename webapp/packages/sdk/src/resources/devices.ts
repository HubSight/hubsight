import type { InternalHttpClient } from '../internal/http/types';
import type { ScanJob } from '../types';

export interface DevicesResource {
  startScan(extraCidrs?: string[]): Promise<ScanJob>;
  getScan(jobId: string): Promise<ScanJob>;
}

export function createDevicesResource(http: InternalHttpClient): DevicesResource {
  return {
    async startScan(extraCidrs: string[] = []): Promise<ScanJob> {
      return http.post<ScanJob>('/devices/scan', { extra_cidrs: extraCidrs });
    },

    async getScan(jobId: string): Promise<ScanJob> {
      return http.get<ScanJob>(`/devices/scan/${jobId}`);
    },
  };
}
