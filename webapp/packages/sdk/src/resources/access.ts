import type { InternalHttpClient } from '../internal/http/types';
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
  list(): Promise<User[]>;
  create(body: CreateUserRequest): Promise<User>;
  update(id: string, body: UpdateUserRequest): Promise<User>;
  block(id: string, blocked: boolean): Promise<User>;
  resetPassword(id: string, newPassword: string): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface RolesResource {
  list(): Promise<Role[]>;
  create(body: CreateRoleRequest): Promise<Role>;
  update(id: string, body: UpdateRoleRequest): Promise<Role>;
  delete(id: string): Promise<void>;
}

export interface PermissionsResource {
  list(): Promise<Permission[]>;
}

export interface AccessResource {
  readonly users: UsersResource;
  readonly roles: RolesResource;
  readonly permissions: PermissionsResource;
}

export function createUsersResource(http: InternalHttpClient): UsersResource {
  return {
    async list(): Promise<User[]> {
      const res = await http.get<User[]>('/auth/users');
      return res || [];
    },

    async create(body: CreateUserRequest): Promise<User> {
      return http.post<User>('/auth/users', body);
    },

    async update(id: string, body: UpdateUserRequest): Promise<User> {
      return http.put<User>(`/auth/users/${id}`, body);
    },

    async block(id: string, blocked: boolean): Promise<User> {
      return http.put<User>(`/auth/users/${id}`, { is_active: !blocked });
    },

    async resetPassword(id: string, newPassword: string): Promise<void> {
      await http.post(`/auth/users/${id}/reset-password`, { new_password: newPassword });
    },

    async delete(id: string): Promise<void> {
      await http.delete(`/auth/users/${id}`);
    },
  };
}

export function createRolesResource(http: InternalHttpClient): RolesResource {
  return {
    async list(): Promise<Role[]> {
      const res = await http.get<Role[]>('/auth/roles');
      return res || [];
    },

    async create(body: CreateRoleRequest): Promise<Role> {
      return http.post<Role>('/auth/roles', body);
    },

    async update(id: string, body: UpdateRoleRequest): Promise<Role> {
      return http.put<Role>(`/auth/roles/${id}`, body);
    },

    async delete(id: string): Promise<void> {
      await http.delete(`/auth/roles/${id}`);
    },
  };
}

export function createPermissionsResource(http: InternalHttpClient): PermissionsResource {
  return {
    async list(): Promise<Permission[]> {
      const res = await http.get<Permission[]>('/auth/permissions');
      return res || [];
    },
  };
}

export function createAccessResource(http: InternalHttpClient): AccessResource {
  return {
    users: createUsersResource(http),
    roles: createRolesResource(http),
    permissions: createPermissionsResource(http),
  };
}
