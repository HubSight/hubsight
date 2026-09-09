import type { InternalHttpClient } from '../internal/http/types';
import type { NvrStatusResponse, SettingsInput, StorageCleanupResult, SystemSettings } from '../types';
import { resolveHttpClient, type HttpLike } from './context';

export interface RecorderResource {
  status(): Promise<NvrStatusResponse>;
  getSettings(): Promise<SystemSettings>;
  updateSettings(body: SettingsInput): Promise<SystemSettings>;
  storageCleanup(): Promise<StorageCleanupResult>;
}

// ── Standalone Tree-Shakable Functions ───────────────────────────────────────

export async function getNvrStatus(client: HttpLike): Promise<NvrStatusResponse> {
  const http = resolveHttpClient(client);
  return http.get<NvrStatusResponse>('/recorder/status');
}

export async function getSettings(client: HttpLike): Promise<SystemSettings> {
  const http = resolveHttpClient(client);
  return http.get<SystemSettings>('/settings');
}

export async function updateRecorderSettings(client: HttpLike, body: SettingsInput): Promise<SystemSettings> {
  const http = resolveHttpClient(client);
  return http.put<SystemSettings>('/settings', body);
}

export async function cleanupStorage(client: HttpLike): Promise<StorageCleanupResult> {
  const http = resolveHttpClient(client);
  return http.post<StorageCleanupResult>('/settings/storage/cleanup');
}

// ── Resource Factory ─────────────────────────────────────────────────────────

export function createRecorderResource(http: InternalHttpClient): RecorderResource {
  return {
    status: () => getNvrStatus(http),
    getSettings: () => getSettings(http),
    updateSettings: (body) => updateRecorderSettings(http, body),
    storageCleanup: () => cleanupStorage(http),
  };
}
