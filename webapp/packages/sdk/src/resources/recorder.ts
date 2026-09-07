import type { InternalHttpClient } from '../internal/http/types';
import type { NvrStatusResponse, SettingsInput, StorageCleanupResult } from '../types';

export interface RecorderResource {
  status(): Promise<NvrStatusResponse>;
  updateSettings(body: SettingsInput): Promise<void>;
  storageCleanup(): Promise<StorageCleanupResult>;
}

export function createRecorderResource(http: InternalHttpClient): RecorderResource {
  return {
    async status(): Promise<NvrStatusResponse> {
      return http.get<NvrStatusResponse>('/recorder/status');
    },

    async updateSettings(body: SettingsInput): Promise<void> {
      await http.put('/settings', body);
    },

    async storageCleanup(): Promise<StorageCleanupResult> {
      return http.post<StorageCleanupResult>('/settings/storage/cleanup');
    },
  };
}

