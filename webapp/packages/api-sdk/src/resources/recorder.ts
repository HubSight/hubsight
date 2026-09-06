import type { ResourceContext } from './context';
import type { NvrStatusResponse, SettingsInput, StorageCleanupResult } from '../types';

export interface RecorderResource {
  /** `GET /recorder/status` — NVR system + storage + per-camera status. */
  status(): Promise<NvrStatusResponse>;
  /** `PUT /settings` — patch NVR/recorder settings (nvr_status, quota, retention…). */
  updateSettings(body: SettingsInput): Promise<void>;
  /** `POST /settings/storage/cleanup` — prune recordings to reclaim disk. */
  storageCleanup(): Promise<StorageCleanupResult>;
}

export function createRecorderResource(ctx: ResourceContext): RecorderResource {
  const { http } = ctx;

  return {
    async status() {
      const res = await http.get<NvrStatusResponse>('/recorder/status');
      return res.data;
    },

    async updateSettings(body) {
      await http.put('/settings', body);
    },

    async storageCleanup() {
      const res = await http.post<StorageCleanupResult>('/settings/storage/cleanup');
      return res.data;
    },
  };
}
