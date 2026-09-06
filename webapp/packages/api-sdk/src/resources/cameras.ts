import type { ResourceContext } from './context';
import type { CameraInput, CameraType, RecognitionLogItem } from '../types';

export interface CamerasResource {
  /** `GET /cameras` — every configured camera/device. */
  list(): Promise<CameraType[]>;
  /** `POST /cameras` — returns the created row (at least `{ id }`). */
  create(body: CameraInput): Promise<CameraType>;
  /** `PUT /cameras/:id`. */
  update(id: string, body: CameraInput): Promise<CameraType>;
  /** `DELETE /cameras/:id`. */
  remove(id: string): Promise<void>;
  /** `POST /cameras/:id/start` — (re)create pool connections. */
  start(id: string): Promise<void>;
  /** `POST /cameras/:id/stop` — flush pool connections. */
  stop(id: string): Promise<void>;
  /** stop → wait `delayMs` → start. Matches the webapp "apply & restart" flow. */
  restart(id: string, delayMs?: number): Promise<void>;
  /** `GET /cameras/:id/recognition-logs`. */
  recognitionLogs(id: string, limit?: number): Promise<RecognitionLogItem[]>;
  /** `DELETE /cameras/:id/recognition-logs`. */
  clearRecognitionLogs(id: string): Promise<void>;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createCamerasResource(ctx: ResourceContext): CamerasResource {
  const { http } = ctx;

  return {
    async list() {
      const res = await http.get<CameraType[]>('/cameras');
      return res.data || [];
    },

    async create(body) {
      const res = await http.post<CameraType>('/cameras', body);
      return res.data;
    },

    async update(id, body) {
      const res = await http.put<CameraType>(`/cameras/${id}`, body);
      return res.data;
    },

    async remove(id) {
      await http.delete(`/cameras/${id}`);
    },

    async start(id) {
      await http.post(`/cameras/${id}/start`);
    },

    async stop(id) {
      await http.post(`/cameras/${id}/stop`);
    },

    async restart(id, delayMs = 800) {
      await http.post(`/cameras/${id}/stop`);
      await wait(delayMs);
      await http.post(`/cameras/${id}/start`);
    },

    async recognitionLogs(id, limit = 50) {
      const res = await http.get<RecognitionLogItem[]>(`/cameras/${id}/recognition-logs`, {
        params: { limit },
      });
      return Array.isArray(res.data) ? res.data : [];
    },

    async clearRecognitionLogs(id) {
      await http.delete(`/cameras/${id}/recognition-logs`);
    },
  };
}
