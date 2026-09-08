import type {
  AppConfig,
  GenerateAppConfigRequest,
  GenerateAppConfigResponse,
  AppConfigQRResponse,
  FirebasePreflightResult,
} from '../types';
import { resolveHttpClient, type HttpLike } from './context';

export type {
  AppConfig,
  GenerateAppConfigRequest,
  GenerateAppConfigResponse,
  AppConfigQRResponse,
  FirebasePreflightResult,
  MobileConfig,
  GenerateMobileConfigRequest,
  GenerateMobileConfigResponse,
  MobileConfigQRResponse,
} from '../types';

export interface AppConfigsResource {
  list(): Promise<AppConfig[]>;
  get(id: string): Promise<AppConfig>;
  generate(data: GenerateAppConfigRequest): Promise<GenerateAppConfigResponse>;
  getDownloadUrl(id: string): string;
  getQr(id: string): Promise<AppConfigQRResponse>;
  delete(id: string): Promise<{ message: string }>;
  preflightFirebase(serviceAccountId: string): Promise<FirebasePreflightResult>;
}

export type MobileConfigsResource = AppConfigsResource;

export function createAppConfigsResource(
  client: HttpLike,
  baseUrl: string = '/api',
): AppConfigsResource {
  const http = resolveHttpClient(client);

  return {
    list: () => listAppConfigs(http),
    get: (id: string) => getAppConfig(http, id),
    generate: (data: GenerateAppConfigRequest) => generateAppConfig(http, data),
    getDownloadUrl: (id: string) => getAppConfigDownloadUrl(baseUrl, id),
    getQr: (id: string) => getAppConfigQr(http, id),
    delete: (id: string) => deleteAppConfig(http, id),
    preflightFirebase: (serviceAccountId: string) => preflightFirebase(http, serviceAccountId),
  };
}

export const createMobileConfigsResource = createAppConfigsResource;

export async function listAppConfigs(client: HttpLike): Promise<AppConfig[]> {
  const http = resolveHttpClient(client);
  const res = await http.get<AppConfig[]>('/app-configs');
  return res || [];
}

export async function getAppConfig(client: HttpLike, id: string): Promise<AppConfig> {
  const http = resolveHttpClient(client);
  return http.get<AppConfig>(`/app-configs/${id}`);
}

export async function generateAppConfig(
  client: HttpLike,
  data: GenerateAppConfigRequest,
): Promise<GenerateAppConfigResponse> {
  const http = resolveHttpClient(client);
  return http.post<GenerateAppConfigResponse>('/app-configs', data);
}

export function getAppConfigDownloadUrl(baseUrl: string, id: string): string {
  const clean = baseUrl.replace(/\/+$/, '');
  return `${clean}/app-configs/${id}/download`;
}

export async function getAppConfigQr(client: HttpLike, id: string): Promise<AppConfigQRResponse> {
  const http = resolveHttpClient(client);
  return http.get<AppConfigQRResponse>(`/app-configs/${id}/qr`);
}

export async function deleteAppConfig(client: HttpLike, id: string): Promise<{ message: string }> {
  const http = resolveHttpClient(client);
  return http.delete<{ message: string }>(`/app-configs/${id}`);
}

export async function preflightFirebase(
  client: HttpLike,
  serviceAccountId: string,
): Promise<FirebasePreflightResult> {
  const http = resolveHttpClient(client);
  return http.get<FirebasePreflightResult>(`/google-service-accounts/${serviceAccountId}/firebase-preflight`);
}

// Backward compatibility function aliases
export const listMobileConfigs = listAppConfigs;
export const getMobileConfig = getAppConfig;
export const generateMobileConfig = generateAppConfig;
export const getMobileConfigDownloadUrl = getAppConfigDownloadUrl;
export const getMobileConfigQr = getAppConfigQr;
export const deleteMobileConfig = deleteAppConfig;
