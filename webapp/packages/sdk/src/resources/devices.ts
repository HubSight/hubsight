import type { InternalHttpClient } from '../internal/http/types';
import type { ScanJob } from '../types';
import { resolveHttpClient, type HttpLike } from './context';

export interface DevicesResource {
  startScan(extraCidrs?: string[]): Promise<ScanJob>;
  getScan(jobId: string): Promise<ScanJob>;
}

// ── Standalone Tree-Shakable Functions ───────────────────────────────────────

export async function startDeviceScan(client: HttpLike, extraCidrs: string[] = []): Promise<ScanJob> {
  const http = resolveHttpClient(client);
  return http.post<ScanJob>('/devices/scan', { extra_cidrs: extraCidrs });
}

export async function getDeviceScan(client: HttpLike, jobId: string): Promise<ScanJob> {
  const http = resolveHttpClient(client);
  return http.get<ScanJob>(`/devices/scan/${jobId}`);
}

// ── Resource Factory ─────────────────────────────────────────────────────────

export function createDevicesResource(http: InternalHttpClient): DevicesResource {
  return {
    startScan: (extraCidrs) => startDeviceScan(http, extraCidrs),
    getScan: (jobId) => getDeviceScan(http, jobId),
  };
}
