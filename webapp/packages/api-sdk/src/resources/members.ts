import type { ResourceContext } from './context';
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
  /** `GET /members` — normalised: the endpoint may return `{data,total,...}` or a bare array. */
  list(params?: ListMembersParams): Promise<MembersPage>;
  create(body: MemberInput): Promise<MemberItem>;
  update(id: string, body: MemberInput): Promise<MemberItem>;
  remove(id: string): Promise<void>;
  /** `POST /members/:id/avatar` (multipart) — returns the stored `avatar_url`. */
  uploadAvatar(id: string, file: File | Blob): Promise<string | undefined>;
  removeAvatar(id: string): Promise<void>;
  /** `GET /members/:id/faces` — normalised page (`faces`, `total`, `total_pages`). */
  listFaces(id: string, params?: ListFacesParams): Promise<FacesPage>;
  /** `POST /members/:id/faces/enroll` (multipart). */
  enrollFace(id: string, file: File | Blob, opts?: { timeoutMs?: number }): Promise<FaceEnrollResult>;
  deleteFace(id: string, faceId: string): Promise<void>;
  /** `DELETE /members/:id/faces` with `{ face_ids }` body. */
  deleteFaces(id: string, faceIds: string[]): Promise<void>;
}

export function createMembersResource(ctx: ResourceContext): MembersResource {
  const { http } = ctx;

  return {
    async list(params) {
      const res = await http.get('/members', { params });
      const raw = res.data as
        | { data?: MemberItem[]; total?: number; family_count?: number; guest_count?: number }
        | MemberItem[]
        | null;

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

    async create(body) {
      const res = await http.post<MemberItem>('/members', body);
      return res.data;
    },

    async update(id, body) {
      const res = await http.put<MemberItem>(`/members/${id}`, body);
      return res.data;
    },

    async remove(id) {
      await http.delete(`/members/${id}`);
    },

    async uploadAvatar(id, file) {
      const form = new FormData();
      form.append('file', file);
      const res = await http.post<{ avatar_url?: string }>(`/members/${id}/avatar`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data?.avatar_url;
    },

    async removeAvatar(id) {
      await http.delete(`/members/${id}/avatar`);
    },

    async listFaces(id, params) {
      const res = await http.get(`/members/${id}/faces`, {
        params: { page: 1, limit: 20, order: 'desc', ...params },
      });
      const raw = res.data as {
        faces?: FaceItem[];
        data?: FaceItem[];
        total?: number;
        total_pages?: number;
        totalPages?: number;
      } | null;
      return {
        faces: raw?.faces || raw?.data || [],
        total: raw?.total || 0,
        total_pages: raw?.total_pages ?? raw?.totalPages ?? 1,
      };
    },

    async enrollFace(id, file, opts) {
      const form = new FormData();
      form.append('file', file);
      const res = await http.post<FaceEnrollResult>(`/members/${id}/faces/enroll`, form, {
        timeout: opts?.timeoutMs ?? 20000,
      });
      return res.data;
    },

    async deleteFace(id, faceId) {
      await http.delete(`/members/${id}/faces/${faceId}`);
    },

    async deleteFaces(id, faceIds) {
      await http.delete(`/members/${id}/faces`, { data: { face_ids: faceIds } });
    },
  };
}
