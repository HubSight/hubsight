import type { ResourceContext } from './context';
import type { Recording, TimelineParams } from '../types';

export interface ArchiveResource {
  /** `GET /archive/:cameraId/available-days` — day-of-month numbers with recordings. */
  availableDays(cameraId: string, year: number, month: number): Promise<number[]>;
  /** `GET /archive/timeline` — recordings for a camera within `[from, to]` (ISO strings). */
  timeline(params: TimelineParams): Promise<Recording[]>;
  /** Absolute URL for a recording's MP4 stream (used as a `<video src>` / download href). */
  streamUrl(recordingId: string, opts?: { download?: boolean }): string;
  /** Absolute URL for a recording's thumbnail image. */
  thumbnailUrl(recordingId: string): string;
}

export function createArchiveResource(ctx: ResourceContext): ArchiveResource {
  const { http, baseUrl } = ctx;

  return {
    async availableDays(cameraId, year, month) {
      const res = await http.get<number[]>(`/archive/${cameraId}/available-days`, {
        params: { year, month },
      });
      return res.data || [];
    },

    async timeline(params) {
      const res = await http.get<Recording[]>('/archive/timeline', { params });
      return res.data || [];
    },

    streamUrl(recordingId, opts) {
      const q = opts?.download ? '?download=true' : '';
      return `${baseUrl}/archive/${recordingId}/stream${q}`;
    },

    thumbnailUrl(recordingId) {
      return `${baseUrl}/archive/${recordingId}/thumbnail`;
    },
  };
}
