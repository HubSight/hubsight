import type { InternalHttpClient } from '../internal/http/types';
import type { NvrStatusResponse, SettingsInput, StorageCleanupResult } from '../types';
import { resolveHttpClient, type HttpLike } from './context';

export interface RecorderResource {
  status(): Promise<NvrStatusResponse>;
  updateSettings(body: SettingsInput): Promise<void>;
  storageCleanup(): Promise<StorageCleanupResult>;
}

// ── Standalone Tree-Shakable Functions ───────────────────────────────────────

export async function getNvrStatus(client: HttpLike): Promise<NvrStatusResponse> {
  const http = resolveHttpClient(client);
  return http.get<NvrStatusResponse>('/recorder/status');
}

export async function updateRecorderSettings(client: HttpLike, body: SettingsInput): Promise<void> {
  const http = resolveHttpClient(client);
  await http.put('/settings', body);
}

export async function cleanupStorage(client: HttpLike): Promise<StorageCleanupResult> {
  const http = resolveHttpClient(client);
  return http.post<StorageCleanupResult>('/settings/storage/cleanup');
}

// ── Resource Factory ─────────────────────────────────────────────────────────

export function createRecorderResource(http: InternalHttpClient): RecorderResource {
  return {
    status: () => getNvrStatus(http),
    updateSettings: (body) => updateRecorderSettings(http, body),
    storageCleanup: () => cleanupStorage(http),
  };
}
