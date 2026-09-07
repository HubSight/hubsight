import type { InternalHttpClient } from '../internal/http/types';
import type { CameraInput, CameraType, RecognitionLogItem } from '../types';

export interface CamerasResource {
  list(): Promise<CameraType[]>;
  get(id: string): Promise<CameraType>;
  create(body: CameraInput): Promise<CameraType>;
  update(id: string, body: CameraInput): Promise<CameraType>;
  remove(id: string): Promise<void>;
  start(id: string): Promise<void>;
  stop(id: string): Promise<void>;
  restart(id: string, delayMs?: number): Promise<void>;
  recognitionLogs(id: string, limit?: number): Promise<RecognitionLogItem[]>;
  clearRecognitionLogs(id: string): Promise<void>;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function createCamerasResource(http: InternalHttpClient): CamerasResource {
  return {
    async list(): Promise<CameraType[]> {
      const res = await http.get<CameraType[]>('/cameras');
      return res || [];
    },

    async get(id: string): Promise<CameraType> {
      return http.get<CameraType>(`/cameras/${id}`);
    },

    async create(body: CameraInput): Promise<CameraType> {
      return http.post<CameraType>('/cameras', body);
    },

    async update(id: string, body: CameraInput): Promise<CameraType> {
      return http.put<CameraType>(`/cameras/${id}`, body);
    },

    async remove(id: string): Promise<void> {
      await http.delete(`/cameras/${id}`);
    },

    async start(id: string): Promise<void> {
      await http.post(`/cameras/${id}/start`);
    },

    async stop(id: string): Promise<void> {
      await http.post(`/cameras/${id}/stop`);
    },

    async restart(id: string, delayMs = 800): Promise<void> {
      await http.post(`/cameras/${id}/stop`);
      await wait(delayMs);
      await http.post(`/cameras/${id}/start`);
    },

    async recognitionLogs(id: string, limit = 50): Promise<RecognitionLogItem[]> {
      const res = await http.get<RecognitionLogItem[]>(`/cameras/${id}/recognition-logs`, {
        params: { limit },
      });
      return res || [];
    },

    async clearRecognitionLogs(id: string): Promise<void> {
      await http.delete(`/cameras/${id}/recognition-logs`);
    },
  };
}
