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

export function createMembersResource(http: InternalHttpClient): MembersResource {
  return {
    async list(params?: ListMembersParams): Promise<MembersPage> {
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
    },

    async create(body: MemberInput): Promise<MemberItem> {
      return http.post<MemberItem>('/members', body);
    },

    async update(id: string, body: MemberInput): Promise<MemberItem> {
      return http.put<MemberItem>(`/members/${id}`, body);
    },

    async remove(id: string): Promise<void> {
      await http.delete(`/members/${id}`);
    },

    async uploadAvatar(id: string, file: File | Blob): Promise<string | undefined> {
      const form = new FormData();
      form.append('file', file);
      const res = await http.post<{ avatar_url?: string }>(`/members/${id}/avatar`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res?.avatar_url;
    },

    async removeAvatar(id: string): Promise<void> {
      await http.delete(`/members/${id}/avatar`);
    },

    async listFaces(id: string, params?: ListFacesParams): Promise<FacesPage> {
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
    },

    async enrollFace(
      id: string,
      file: File | Blob,
      opts?: { timeoutMs?: number },
    ): Promise<FaceEnrollResult> {
      const form = new FormData();
      form.append('file', file);
      return http.post<FaceEnrollResult>(`/members/${id}/faces/enroll`, form, {
        timeoutMs: opts?.timeoutMs ?? 20000,
      });
    },

    async deleteFace(id: string, faceId: string): Promise<void> {
      await http.delete(`/members/${id}/faces/${faceId}`);
    },

    async deleteFaces(id: string, faceIds: string[]): Promise<void> {
      await http.delete(`/members/${id}/faces`, {
        body: { face_ids: faceIds },
      });
    },
  };
}

