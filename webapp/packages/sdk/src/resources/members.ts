import type { InternalHttpClient } from '../internal/http/types';
import type {
  FaceEnrollResult,
  FaceItem,
  FacesPage,
  ListFacesParams,
  ListMembersParams,
  MemberInput,
  MemberItem,
  MembersPage,
} from '../types';
import { resolveHttpClient, type HttpLike } from './context';

export interface MembersResource {
  list(params?: ListMembersParams): Promise<MembersPage>;
  create(body: MemberInput): Promise<MemberItem>;
  update(id: string, body: MemberInput): Promise<MemberItem>;
  remove(id: string): Promise<void>;
  uploadAvatar(id: string, file: File | Blob): Promise<string | undefined>;
  removeAvatar(id: string): Promise<void>;
  listFaces(id: string, params?: ListFacesParams): Promise<FacesPage>;
  enrollFace(id: string, file: File | Blob, opts?: { timeoutMs?: number }): Promise<FaceEnrollResult>;
  deleteFace(id: string, faceId: string): Promise<void>;
  deleteFaces(id: string, faceIds: string[]): Promise<void>;
}

// ── Standalone Tree-Shakable Functions ───────────────────────────────────────

export async function listMembers(client: HttpLike, params?: ListMembersParams): Promise<MembersPage> {
  const http = resolveHttpClient(client);
  const raw = await http.get<
    | { data?: MemberItem[]; total?: number; family_count?: number; guest_count?: number }
    | MemberItem[]
    | null
  >('/members', { params: params as Record<string, string | number | boolean | undefined> });

  if (Array.isArray(raw)) {
    return {
      data: raw,
      total: raw.length,
      family_count: raw.filter((m) => m.role === 'family').length,
      guest_count: raw.filter((m) => m.role !== 'family').length,
    };
  }
  return {
    data: raw?.data || [],
    total: raw?.total || 0,
    family_count: raw?.family_count,
    guest_count: raw?.guest_count,
  };
}

export async function createMember(client: HttpLike, body: MemberInput): Promise<MemberItem> {
  const http = resolveHttpClient(client);
  return http.post<MemberItem>('/members', body);
}

export async function updateMember(client: HttpLike, id: string, body: MemberInput): Promise<MemberItem> {
  const http = resolveHttpClient(client);
  return http.put<MemberItem>(`/members/${id}`, body);
}

export async function deleteMember(client: HttpLike, id: string): Promise<void> {
  const http = resolveHttpClient(client);
  await http.delete(`/members/${id}`);
}

export async function uploadMemberAvatar(
  client: HttpLike,
  id: string,
  file: File | Blob,
): Promise<string | undefined> {
  const http = resolveHttpClient(client);
  const form = new FormData();
  form.append('file', file);
  const res = await http.post<{ avatar_url?: string }>(`/members/${id}/avatar`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res?.avatar_url;
}

export async function removeMemberAvatar(client: HttpLike, id: string): Promise<void> {
  const http = resolveHttpClient(client);
  await http.delete(`/members/${id}/avatar`);
}

export async function listMemberFaces(
  client: HttpLike,
  id: string,
  params?: ListFacesParams,
): Promise<FacesPage> {
  const http = resolveHttpClient(client);
  const raw = await http.get<{
    faces?: FaceItem[];
    data?: FaceItem[];
    total?: number;
    total_pages?: number;
    totalPages?: number;
  } | null>(`/members/${id}/faces`, {
    params: { page: 1, limit: 20, order: 'desc', ...params },
  });
  return {
    faces: raw?.faces || raw?.data || [],
    total: raw?.total || 0,
    total_pages: raw?.total_pages ?? raw?.totalPages ?? 1,
  };
}

export async function enrollMemberFace(
  client: HttpLike,
  id: string,
  file: File | Blob,
  opts?: { timeoutMs?: number },
): Promise<FaceEnrollResult> {
  const http = resolveHttpClient(client);
  const form = new FormData();
  form.append('file', file);
  return http.post<FaceEnrollResult>(`/members/${id}/faces/enroll`, form, {
    timeoutMs: opts?.timeoutMs ?? 20000,
  });
}

export async function deleteMemberFace(client: HttpLike, id: string, faceId: string): Promise<void> {
  const http = resolveHttpClient(client);
  await http.delete(`/members/${id}/faces/${faceId}`);
}

export async function deleteMemberFaces(client: HttpLike, id: string, faceIds: string[]): Promise<void> {
  const http = resolveHttpClient(client);
  await http.delete(`/members/${id}/faces`, {
    body: { face_ids: faceIds },
  });
}

// ── Resource Factory ─────────────────────────────────────────────────────────

export function createMembersResource(http: InternalHttpClient): MembersResource {
  return {
    list: (params) => listMembers(http, params),
    create: (body) => createMember(http, body),
    update: (id, body) => updateMember(http, id, body),
    remove: (id) => deleteMember(http, id),
    uploadAvatar: (id, file) => uploadMemberAvatar(http, id, file),
    removeAvatar: (id) => removeMemberAvatar(http, id),
    listFaces: (id, params) => listMemberFaces(http, id, params),
    enrollFace: (id, file, opts) => enrollMemberFace(http, id, file, opts),
    deleteFace: (id, faceId) => deleteMemberFace(http, id, faceId),
    deleteFaces: (id, faceIds) => deleteMemberFaces(http, id, faceIds),
  };
}
