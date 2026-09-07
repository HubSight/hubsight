import type { ResourceContext } from './context';
import type {
  CreateRoleRequest,
  CreateUserRequest,
  Permission,
  Role,
  UpdateRoleRequest,
  UpdateUserRequest,
  User,
} from '../types';

export interface UsersResource {
  /** `GET /auth/users` — list all users with roles and permissions. */
  list(): Promise<User[]>;
  /** `POST /auth/users` — create a new user account. */
  create(body: CreateUserRequest): Promise<User>;
  /** `PUT /auth/users/:id` — update user full name, assigned role, or active status. */
  update(id: string, body: UpdateUserRequest): Promise<User>;
  /** `POST /auth/users/:id/reset-password` — reset a user's password. */
  resetPassword(id: string, newPassword: string): Promise<void>;
  /** `DELETE /auth/users/:id` — delete a user account and active sessions. */
  delete(id: string): Promise<void>;
}

export interface RolesResource {
  /** `GET /auth/roles` — list all roles with preloaded permissions. */
  list(): Promise<Role[]>;
  /** `POST /auth/roles` — create a new custom role. */
  create(body: CreateRoleRequest): Promise<Role>;
  /** `PUT /auth/roles/:id` — update role metadata and permission assignments. */
  update(id: string, body: UpdateRoleRequest): Promise<Role>;
  /** `DELETE /auth/roles/:id` — delete a custom role if unassigned. */
  delete(id: string): Promise<void>;
}

export interface PermissionsResource {
  /** `GET /auth/permissions` — list all standard system permissions. */
  list(): Promise<Permission[]>;
}

export function createUsersResource(ctx: ResourceContext): UsersResource {
  const { http } = ctx;

  return {
    async list() {
      const res = await http.get<User[]>('/auth/users');
      return res.data;
    },

    async create(body) {
      const res = await http.post<User>('/auth/users', body);
      return res.data;
    },

    async update(id, body) {
      const res = await http.put<User>(`/auth/users/${id}`, body);
      return res.data;
    },

    async resetPassword(id, newPassword) {
      await http.post(`/auth/users/${id}/reset-password`, { new_password: newPassword });
    },

    async delete(id) {
      await http.delete(`/auth/users/${id}`);
    },
  };
}

export function createRolesResource(ctx: ResourceContext): RolesResource {
  const { http } = ctx;

  return {
    async list() {
      const res = await http.get<Role[]>('/auth/roles');
      return res.data;
    },

    async create(body) {
      const res = await http.post<Role>('/auth/roles', body);
      return res.data;
    },

    async update(id, body) {
      const res = await http.put<Role>(`/auth/roles/${id}`, body);
      return res.data;
    },

    async delete(id) {
      await http.delete(`/auth/roles/${id}`);
    },
  };
}

export function createPermissionsResource(ctx: ResourceContext): PermissionsResource {
  const { http } = ctx;

  return {
    async list() {
      const res = await http.get<Permission[]>('/auth/permissions');
      return res.data;
    },
  };
}

