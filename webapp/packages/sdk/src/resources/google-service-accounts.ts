import type {
  GoogleServiceAccount,
  ImportGoogleServiceAccountInput,
  ImportGoogleServiceAccountResponse,
  TestGoogleServiceAccountResult,
} from '../types';
import { resolveHttpClient, type HttpLike } from './context';

export interface GoogleServiceAccountsResource {
  list(): Promise<GoogleServiceAccount[]>;
  get(id: string): Promise<GoogleServiceAccount>;
  importJson(body: ImportGoogleServiceAccountInput): Promise<ImportGoogleServiceAccountResponse>;
  importFile(file: File, name?: string, isActive?: boolean): Promise<ImportGoogleServiceAccountResponse>;
  activate(id: string): Promise<GoogleServiceAccount>;
  test(id: string): Promise<TestGoogleServiceAccountResult>;
  delete(id: string): Promise<{ message: string }>;
}

/**
 * Creates the Google Service Accounts resource client.
 */
export function createGoogleServiceAccountsResource(client: HttpLike): GoogleServiceAccountsResource {
  const http = resolveHttpClient(client);

  return {
    list: () => listGoogleServiceAccounts(http),
    get: (id) => getGoogleServiceAccount(http, id),
    importJson: (body) => importGoogleServiceAccount(http, body),
    importFile: (file, name, isActive) => importGoogleServiceAccountFile(http, file, name, isActive),
    activate: (id) => activateGoogleServiceAccount(http, id),
    test: (id) => testGoogleServiceAccount(http, id),
    delete: (id) => deleteGoogleServiceAccount(http, id),
  };
}

// ── Standalone Functions ───────────────────────────────────────────────────

export async function listGoogleServiceAccounts(client: HttpLike): Promise<GoogleServiceAccount[]> {
  const http = resolveHttpClient(client);
  const res = await http.get<GoogleServiceAccount[]>('/google-service-accounts');
  return res || [];
}

export async function getGoogleServiceAccount(client: HttpLike, id: string): Promise<GoogleServiceAccount> {
  const http = resolveHttpClient(client);
  return http.get<GoogleServiceAccount>(`/google-service-accounts/${id}`);
}

export async function importGoogleServiceAccount(
  client: HttpLike,
  body: ImportGoogleServiceAccountInput,
): Promise<ImportGoogleServiceAccountResponse> {
  const http = resolveHttpClient(client);
  return http.post<ImportGoogleServiceAccountResponse>('/google-service-accounts/import', body);
}

export async function importGoogleServiceAccountFile(
  client: HttpLike,
  file: File,
  name?: string,
  isActive: boolean = true,
): Promise<ImportGoogleServiceAccountResponse> {
  const http = resolveHttpClient(client);
  const formData = new FormData();
  formData.append('file', file);
  if (name) formData.append('name', name);
  formData.append('is_active', isActive ? 'true' : 'false');

  return http.post<ImportGoogleServiceAccountResponse>('/google-service-accounts/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

export async function activateGoogleServiceAccount(client: HttpLike, id: string): Promise<GoogleServiceAccount> {
  const http = resolveHttpClient(client);
  return http.put<GoogleServiceAccount>(`/google-service-accounts/${id}/activate`);
}

export async function testGoogleServiceAccount(client: HttpLike, id: string): Promise<TestGoogleServiceAccountResult> {
  const http = resolveHttpClient(client);
  return http.post<TestGoogleServiceAccountResult>(`/google-service-accounts/${id}/test`);
}

export async function deleteGoogleServiceAccount(client: HttpLike, id: string): Promise<{ message: string }> {
  const http = resolveHttpClient(client);
  return http.delete<{ message: string }>(`/google-service-accounts/${id}`);
}
