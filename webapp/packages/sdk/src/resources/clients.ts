import type {
  ApiClient,
  CreateClientRequest,
  UpdateClientRequest,
} from '../types';
import { resolveHttpClient, type HttpLike } from './context';

export interface ClientsResource {
  list(): Promise<ApiClient[]>;
  create(body: CreateClientRequest): Promise<ApiClient>;
  update(id: string, body: UpdateClientRequest): Promise<ApiClient>;
  toggle(id: string): Promise<{ status: string; is_active: boolean; client: ApiClient }>;
  rotateKey(id: string): Promise<{ status: string; api_key: string; client: ApiClient }>;
  delete(id: string): Promise<void>;
  verify(apiKey?: string): Promise<{ valid: boolean; client_id?: string; name?: string }>;
}

/**
 * Creates the Clients REST resource client for managing authorized client applications and API keys.
 */
export function createClientsResource(client: HttpLike): ClientsResource {
  const http = resolveHttpClient(client);

  return {
    list: () => listClients(http),
    create: (body) => createClient(http, body),
    update: (id, body) => updateClient(http, id, body),
    toggle: (id) => toggleClient(http, id),
    rotateKey: (id) => rotateClientKey(http, id),
    delete: (id) => deleteClient(http, id),
    verify: (apiKey) => verifyClientKey(http, apiKey),
  };
}

// ── Standalone Tree-Shakable Functions ───────────────────────────────────────

export async function listClients(client: HttpLike): Promise<ApiClient[]> {
  const http = resolveHttpClient(client);
  const res = await http.get<ApiClient[]>('/auth/clients');
  return res || [];
}

export async function createClient(
  client: HttpLike,
  body: CreateClientRequest,
): Promise<ApiClient> {
  const http = resolveHttpClient(client);
  return http.post<ApiClient>('/auth/clients', body);
}

export async function updateClient(
  client: HttpLike,
  id: string,
  body: UpdateClientRequest,
): Promise<ApiClient> {
  const http = resolveHttpClient(client);
  return http.put<ApiClient>(`/auth/clients/${id}`, body);
}

export async function toggleClient(
  client: HttpLike,
  id: string,
): Promise<{ status: string; is_active: boolean; client: ApiClient }> {
  const http = resolveHttpClient(client);
  return http.put<{ status: string; is_active: boolean; client: ApiClient }>(
    `/auth/clients/${id}/toggle`,
  );
}

export async function rotateClientKey(
  client: HttpLike,
  id: string,
): Promise<{ status: string; api_key: string; client: ApiClient }> {
  const http = resolveHttpClient(client);
  return http.post<{ status: string; api_key: string; client: ApiClient }>(
    `/auth/clients/${id}/rotate-key`,
  );
}

export async function deleteClient(client: HttpLike, id: string): Promise<void> {
  const http = resolveHttpClient(client);
  await http.delete(`/auth/clients/${id}`);
}

export async function verifyClientKey(
  client: HttpLike,
  apiKey?: string,
): Promise<{ valid: boolean; client_id?: string; name?: string }> {
  const http = resolveHttpClient(client);
  return http.get<{ valid: boolean; client_id?: string; name?: string }>(
    '/auth/clients/verify',
    {
      headers: apiKey ? { 'X-API-Key': apiKey } : undefined,
    },
  );
}
