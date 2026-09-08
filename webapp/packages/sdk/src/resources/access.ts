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
import { resolveHttpClient, type HttpLike } from './context';

export interface UsersResource {
  list(): Promise<User[]>;
  create(body: CreateUserRequest): Promise<User>;
  update(id: string, body: UpdateUserRequest): Promise<User>;
  block(id: string, blocked: boolean): Promise<User>;
  resetPassword(id: string, newPassword: string, mustChangePassword?: boolean): Promise<void>;
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

// ── Standalone Tree-Shakable Functions ───────────────────────────────────────

export async function listUsers(client: HttpLike): Promise<User[]> {
  const http = resolveHttpClient(client);
  const res = await http.get<User[]>('/auth/users');
  return res || [];
}

export async function createUser(client: HttpLike, body: CreateUserRequest): Promise<User> {
  const http = resolveHttpClient(client);
  return http.post<User>('/auth/users', body);
}

export async function updateUser(client: HttpLike, id: string, body: UpdateUserRequest): Promise<User> {
  const http = resolveHttpClient(client);
  return http.put<User>(`/auth/users/${id}`, body);
}

export async function blockUser(client: HttpLike, id: string, blocked: boolean): Promise<User> {
  const http = resolveHttpClient(client);
  return http.put<User>(`/auth/users/${id}`, { is_active: !blocked });
}

export async function resetUserPassword(client: HttpLike, id: string, newPassword: string, mustChangePassword = true): Promise<void> {
  const http = resolveHttpClient(client);
  await http.post(`/auth/users/${id}/reset-password`, {
    new_password: newPassword,
    must_change_password: mustChangePassword,
  });
}

export async function deleteUser(client: HttpLike, id: string): Promise<void> {
  const http = resolveHttpClient(client);
  await http.delete(`/auth/users/${id}`);
}

export async function listRoles(client: HttpLike): Promise<Role[]> {
  const http = resolveHttpClient(client);
  const res = await http.get<Role[]>('/auth/roles');
  return res || [];
}

export async function createRole(client: HttpLike, body: CreateRoleRequest): Promise<Role> {
  const http = resolveHttpClient(client);
  return http.post<Role>('/auth/roles', body);
}

export async function updateRole(client: HttpLike, id: string, body: UpdateRoleRequest): Promise<Role> {
  const http = resolveHttpClient(client);
  return http.put<Role>(`/auth/roles/${id}`, body);
}

export async function deleteRole(client: HttpLike, id: string): Promise<void> {
  const http = resolveHttpClient(client);
  await http.delete(`/auth/roles/${id}`);
}

export async function listPermissions(client: HttpLike): Promise<Permission[]> {
  const http = resolveHttpClient(client);
  const res = await http.get<Permission[]>('/auth/permissions');
  return res || [];
}

// ── Resource Factories ───────────────────────────────────────────────────────

export function createUsersResource(http: InternalHttpClient): UsersResource {
  return {
    list: () => listUsers(http),
    create: (body) => createUser(http, body),
    update: (id, body) => updateUser(http, id, body),
    block: (id, blocked) => blockUser(http, id, blocked),
    resetPassword: (id, newPassword, mustChangePassword) => resetUserPassword(http, id, newPassword, mustChangePassword),
    delete: (id) => deleteUser(http, id),
  };
}

export function createRolesResource(http: InternalHttpClient): RolesResource {
  return {
    list: () => listRoles(http),
    create: (body) => createRole(http, body),
    update: (id, body) => updateRole(http, id, body),
    delete: (id) => deleteRole(http, id),
  };
}

export function createPermissionsResource(http: InternalHttpClient): PermissionsResource {
  return {
    list: () => listPermissions(http),
  };
}

export function createAccessResource(http: InternalHttpClient): AccessResource {
  return {
    users: createUsersResource(http),
    roles: createRolesResource(http),
    permissions: createPermissionsResource(http),
  };
}
