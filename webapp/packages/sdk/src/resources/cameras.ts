import type { InternalHttpClient } from '../internal/http/types';
import type {
  CameraInput,
  CameraType,
  HomographyPoint,
  RecognitionLogItem,
  PTZActionInput,
  PresetItem,
  ManagePresetInput,
  ProbeONVIFInput,
  ONVIFProbeResult,
} from '../types';
import { resolveHttpClient, type HttpLike } from './context';

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
  updateHomography(id: string, points: HomographyPoint[]): Promise<CameraType>;
  ptz(id: string, body: PTZActionInput): Promise<void>;
  getPresets(id: string): Promise<PresetItem[]>;
  managePreset(id: string, body: ManagePresetInput): Promise<{ preset_token?: string; name?: string } | void>;
  probeOnvif(body: ProbeONVIFInput): Promise<ONVIFProbeResult>;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ── Standalone Tree-Shakable Functions ───────────────────────────────────────

export async function listCameras(client: HttpLike): Promise<CameraType[]> {
  const http = resolveHttpClient(client);
  const res = await http.get<CameraType[]>('/cameras');
  return res || [];
}

export async function getCamera(client: HttpLike, id: string): Promise<CameraType> {
  const http = resolveHttpClient(client);
  return http.get<CameraType>(`/cameras/${id}`);
}

export async function createCamera(client: HttpLike, body: CameraInput): Promise<CameraType> {
  const http = resolveHttpClient(client);
  return http.post<CameraType>('/cameras', body);
}

export async function updateCamera(client: HttpLike, id: string, body: CameraInput): Promise<CameraType> {
  const http = resolveHttpClient(client);
  return http.put<CameraType>(`/cameras/${id}`, body);
}

export async function deleteCamera(client: HttpLike, id: string): Promise<void> {
  const http = resolveHttpClient(client);
  await http.delete(`/cameras/${id}`);
}

export async function startCamera(client: HttpLike, id: string): Promise<void> {
  const http = resolveHttpClient(client);
  await http.post(`/cameras/${id}/start`);
}

export async function stopCamera(client: HttpLike, id: string): Promise<void> {
  const http = resolveHttpClient(client);
  await http.post(`/cameras/${id}/stop`);
}

export async function restartCamera(client: HttpLike, id: string, delayMs = 800): Promise<void> {
  await stopCamera(client, id);
  await wait(delayMs);
  await startCamera(client, id);
}

export async function getCameraRecognitionLogs(
  client: HttpLike,
  id: string,
  limit = 50,
): Promise<RecognitionLogItem[]> {
  const http = resolveHttpClient(client);
  const res = await http.get<RecognitionLogItem[]>(`/cameras/${id}/recognition-logs`, {
    params: { limit },
  });
  return res || [];
}

export async function clearCameraRecognitionLogs(client: HttpLike, id: string): Promise<void> {
  const http = resolveHttpClient(client);
  await http.delete(`/cameras/${id}/recognition-logs`);
}

export async function updateCameraHomography(
  client: HttpLike,
  id: string,
  points: HomographyPoint[],
): Promise<CameraType> {
  const http = resolveHttpClient(client);
  return http.put<CameraType>(`/cameras/${id}/homography`, { points });
}

export async function cameraPTZ(
  client: HttpLike,
  id: string,
  body: PTZActionInput,
): Promise<void> {
  const http = resolveHttpClient(client);
  await http.post(`/cameras/${id}/ptz`, body);
}

export async function getCameraPresets(
  client: HttpLike,
  id: string,
): Promise<PresetItem[]> {
  const http = resolveHttpClient(client);
  const res = await http.get<PresetItem[]>(`/cameras/${id}/presets`);
  return res || [];
}

export async function manageCameraPreset(
  client: HttpLike,
  id: string,
  body: ManagePresetInput,
): Promise<{ preset_token?: string; name?: string } | void> {
  const http = resolveHttpClient(client);
  return http.post<{ preset_token?: string; name?: string }>(`/cameras/${id}/presets`, body);
}

export async function probeONVIF(
  client: HttpLike,
  body: ProbeONVIFInput,
): Promise<ONVIFProbeResult> {
  const http = resolveHttpClient(client);
  return http.post<ONVIFProbeResult>('/onvif/probe', body);
}

// ── Resource Factory ─────────────────────────────────────────────────────────

export function createCamerasResource(http: InternalHttpClient): CamerasResource {
  return {
    list: () => listCameras(http),
    get: (id) => getCamera(http, id),
    create: (body) => createCamera(http, body),
    update: (id, body) => updateCamera(http, id, body),
    remove: (id) => deleteCamera(http, id),
    start: (id) => startCamera(http, id),
    stop: (id) => stopCamera(http, id),
    restart: (id, delayMs) => restartCamera(http, id, delayMs),
    recognitionLogs: (id, limit) => getCameraRecognitionLogs(http, id, limit),
    clearRecognitionLogs: (id) => clearCameraRecognitionLogs(http, id),
    updateHomography: (id, points) => updateCameraHomography(http, id, points),
    ptz: (id, body) => cameraPTZ(http, id, body),
    getPresets: (id) => getCameraPresets(http, id),
    managePreset: (id, body) => manageCameraPreset(http, id, body),
    probeOnvif: (body) => probeONVIF(http, body),
  };
}
