import type { InternalHttpClient } from '../internal/http/types';
import type { Recording, TimelineParams } from '../types';

export interface ArchiveResource {
  availableDays(cameraId: string, year: number, month: number): Promise<number[]>;
  timeline(params: TimelineParams): Promise<Recording[]>;
  streamUrl(recordingId: string, opts?: { download?: boolean }): string;
  thumbnailUrl(recordingId: string): string;
}

export function createArchiveResource(
  http: InternalHttpClient,
  baseUrl: string,
): ArchiveResource {
  return {
    async availableDays(cameraId: string, year: number, month: number): Promise<number[]> {
      const res = await http.get<number[]>(`/archive/${cameraId}/available-days`, {
        params: { year, month },
      });
      return res || [];
    },

    async timeline(params: TimelineParams): Promise<Recording[]> {
      const res = await http.get<Recording[]>('/archive/timeline', {
        params: params as unknown as Record<string, string | number | boolean | undefined>,
      });
      return res || [];
    },

    streamUrl(recordingId: string, opts?: { download?: boolean }): string {
      const q = opts?.download ? '?download=true' : '';
      return `${baseUrl}/archive/${recordingId}/stream${q}`;
    },

    thumbnailUrl(recordingId: string): string {
      return `${baseUrl}/archive/${recordingId}/thumbnail`;
    },
  };
}
