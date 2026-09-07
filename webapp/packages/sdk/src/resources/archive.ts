import type { InternalHttpClient } from '../internal/http/types';
import type { Recording, TimelineParams } from '../types';
import { resolveHttpClient, type HttpLike } from './context';

export interface ArchiveResource {
  availableDays(cameraId: string, year: number, month: number): Promise<number[]>;
  timeline(params: TimelineParams): Promise<Recording[]>;
  streamUrl(recordingId: string, opts?: { download?: boolean }): string;
  thumbnailUrl(recordingId: string): string;
}

// ── Standalone Tree-Shakable Functions ───────────────────────────────────────

export async function getAvailableDays(
  client: HttpLike,
  cameraId: string,
  year: number,
  month: number,
): Promise<number[]> {
  const http = resolveHttpClient(client);
  const res = await http.get<number[]>(`/archive/${cameraId}/available-days`, {
    params: { year, month },
  });
  return res || [];
}

export async function getTimeline(
  client: HttpLike,
  params: TimelineParams,
): Promise<Recording[]> {
  const http = resolveHttpClient(client);
  const res = await http.get<Recording[]>('/archive/timeline', {
    params: params as unknown as Record<string, string | number | boolean | undefined>,
  });
  return res || [];
}

export function getStreamUrl(
  baseUrl: string,
  recordingId: string,
  opts?: { download?: boolean },
): string {
  const q = opts?.download ? '?download=true' : '';
  return `${baseUrl}/archive/${recordingId}/stream${q}`;
}

export function getThumbnailUrl(baseUrl: string, recordingId: string): string {
  return `${baseUrl}/archive/${recordingId}/thumbnail`;
}

// ── Resource Factory ─────────────────────────────────────────────────────────

export function createArchiveResource(
  http: InternalHttpClient,
  baseUrl: string,
): ArchiveResource {
  return {
    availableDays: (cameraId, year, month) => getAvailableDays(http, cameraId, year, month),
    timeline: (params) => getTimeline(http, params),
    streamUrl: (recordingId, opts) => getStreamUrl(baseUrl, recordingId, opts),
    thumbnailUrl: (recordingId) => getThumbnailUrl(baseUrl, recordingId),
  };
}
