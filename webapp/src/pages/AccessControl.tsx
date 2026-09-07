import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Shield,
  Users,
  KeyRound,
  Plus,
  Search,
  Check,
  X,
  Edit2,
  Trash2,
  CheckCircle2,
  Camera,
  Video,
  Activity,
  Sliders,
  UserCheck,
  Lock,
  Ban,
} from 'lucide-react';
import { api } from '../api/client';
import type { User, Role, Permission } from '@hubsight/sdk';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../i18n';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import toast from 'react-hot-toast';

export const AccessControl: React.FC = () => {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();

  const [activeTab, setActiveTab] = useState<'users' | 'roles'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Users Tab state
  const [userSearch, setUserSearch] = useState('');
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [resetPasswordModalOpen, setResetPasswordModalOpen] = useState(false);
  const [userToResetPassword, setUserToResetPassword] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [pendingToggleBlockUser, setPendingToggleBlockUser] = useState<User | null>(null);

  // User form state
  const [formUsername, setFormUsername] = useState('');
  const [formFullName, setFormFullName] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRoleId, setFormRoleId] = useState<string>('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);

  // Roles Tab state
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [formRoleName, setFormRoleName] = useState('');
  const [formRoleCode, setFormRoleCode] = useState('');
  const [formRoleDesc, setFormRoleDesc] = useState('');
  const [isSubmittingRole, setIsSubmittingRole] = useState(false);
  const [selectedRolePermIds, setSelectedRolePermIds] = useState<Set<string>>(new Set());
  const [isSavingPerms, setIsSavingPerms] = useState(false);
  const [pendingDeleteRoleId, setPendingDeleteRoleId] = useState<string | null>(null);

  // Load all initial data
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [uList, rList, pList] = await Promise.all([
        api.users.list(),
        api.roles.list(),
        api.permissions.list(),
      ]);
      setUsers(uList);
      setRoles(rList);
      setPermissions(pList);
      setSelectedRoleId((prev) => {
        if (prev && rList.some((r) => r.id === prev)) return prev;
        return rList.length > 0 ? rList[0].id : '';
      });
    } catch (err) {
      console.error('Failed to load access control data:', err);
      toast.error(t('common.errorOccurred'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Sync selected role permissions when active role changes
  const activeRole = useMemo(() => {
    return roles.find((r) => r.id === selectedRoleId) || roles[0] || null;
  }, [roles, selectedRoleId]);

  useEffect(() => {
    if (activeRole && activeRole.permissions) {
      setSelectedRolePermIds(new Set(activeRole.permissions.map((p) => p.id)));
    } else {
      setSelectedRolePermIds(new Set());
    }
  }, [activeRole]);

  // Group permissions by module
  const permissionsByModule = useMemo(() => {
    const map = new Map<string, Permission[]>();
    permissions.forEach((p) => {
      const list = map.get(p.module) || [];
      list.push(p);
      map.set(p.module, list);
    });
    return map;
  }, [permissions]);

  const getModuleTitle = (mod: string) => {
    switch (mod) {
      case 'cameras':
        return t('access.moduleCameras');
      case 'members':
        return t('access.moduleMembers');
      case 'recordings':
        return t('access.moduleRecordings');
      case 'system':
        return t('access.moduleSystem');
      case 'access':
        return t('access.moduleAccess');
      default:
        return mod.toUpperCase();
    }
  };

  const getModuleIcon = (mod: string) => {
    switch (mod) {
      case 'cameras':
        return <Camera size={18} className="text-blue-500" />;
      case 'members':
        return <Users size={18} className="text-emerald-500" />;
      case 'recordings':
        return <Video size={18} className="text-purple-500" />;
      case 'system':
        return <Activity size={18} className="text-amber-500" />;
      case 'access':
        return <Shield size={18} className="text-rose-500" />;
      default:
        return <Sliders size={18} className="text-slate-500" />;
    }
  };

  // User Actions
  const handleOpenCreateUser = () => {
    setEditingUser(null);
    setFormUsername('');
    setFormFullName('');
    setFormPassword('');
    setFormRoleId(roles.find((r) => r.code === 'viewer')?.id || roles[0]?.id || '');
    setFormIsActive(true);
    setUserModalOpen(true);
  };

  const handleOpenEditUser = (u: User) => {
    setEditingUser(u);
    setFormUsername(u.username);
    setFormFullName(u.full_name || '');
    setFormRoleId(u.role_id || '');
    setFormIsActive(u.is_active);
    setUserModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingUser(true);
    try {
      if (editingUser) {
        await api.users.update(editingUser.id, {
          full_name: formFullName,
          role_id: formRoleId || undefined,
          is_active: formIsActive,
        });
        toast.success(t('access.saveSuccess'));
      } else {
        await api.users.create({
          username: formUsername,
          full_name: formFullName,
          password: formPassword,
          role_id: formRoleId || undefined,
          is_active: formIsActive,
        });
        toast.success(t('access.saveSuccess'));
      }
      setUserModalOpen(false);
      await loadData();
    } catch (err: any) {
      const msg = err?.response?.data?.error || t('common.errorOccurred');
      toast.error(msg);
    } finally {
      setIsSubmittingUser(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userToResetPassword) return;
    try {
      await api.users.resetPassword(userToResetPassword.id, newPassword);
      toast.success(t('access.resetPasswordSuccess'));
      setResetPasswordModalOpen(false);
      setNewPassword('');
    } catch (err: any) {
      const msg = err?.response?.data?.error || t('common.errorOccurred');
      toast.error(msg);
    }
  };

  const handleToggleBlockUser = async () => {
    if (!pendingToggleBlockUser) return;
    const target = pendingToggleBlockUser;
    const willBlock = target.is_active; // if active, we block; if inactive, we unblock
    try {
      await api.users.block(target.id, willBlock);
      toast.success(willBlock ? t('access.blockUserSuccess') : t('access.unblockUserSuccess'));
      setPendingToggleBlockUser(null);
      await loadData();
    } catch (err: any) {
      const msg = err?.response?.data?.error || t('common.errorOccurred');
      toast.error(msg);
    }
  };

  // Role Actions
  const handleOpenCreateRole = () => {
    setFormRoleName('');
    setFormRoleCode('');
    setFormRoleDesc('');
    setRoleModalOpen(true);
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingRole(true);
    try {
      const newRole = await api.roles.create({
        name: formRoleName,
        code: formRoleCode,
        description: formRoleDesc,
      });
      toast.success(t('access.saveSuccess'));
      setRoleModalOpen(false);
      await loadData();
      setSelectedRoleId(newRole.id);
    } catch (err: any) {
      const msg = err?.response?.data?.error || t('common.errorOccurred');
      toast.error(msg);
    } finally {
      setIsSubmittingRole(false);
    }
  };

  const handleDeleteRole = async () => {
    if (!pendingDeleteRoleId) return;
    try {
      await api.roles.delete(pendingDeleteRoleId);
      toast.success(t('access.deleteRoleSuccess'));
      setPendingDeleteRoleId(null);
      await loadData();
    } catch (err: any) {
      const msg = err?.response?.data?.error || t('common.errorOccurred');
      toast.error(msg);
    }
  };

  const handleTogglePermission = (permId: string) => {
    if (!activeRole || activeRole.code === 'admin') return;
    setSelectedRolePermIds((prev) => {
      const next = new Set(prev);
      if (next.has(permId)) {
        next.delete(permId);
      } else {
        next.add(permId);
      }
      return next;
    });
  };

  const handleToggleModuleAll = (moduleName: string) => {
    if (!activeRole || activeRole.code === 'admin') return;
    const modulePerms = permissionsByModule.get(moduleName) || [];
    const allSelected = modulePerms.every((p) => selectedRolePermIds.has(p.id));

    setSelectedRolePermIds((prev) => {
      const next = new Set(prev);
      modulePerms.forEach((p) => {
        if (allSelected) {
          next.delete(p.id);
        } else {
          next.add(p.id);
        }
      });
      return next;
    });
  };

  const handleSaveRolePermissions = async () => {
    if (!activeRole || activeRole.code === 'admin') return;
    setIsSavingPerms(true);
    try {
      await api.roles.update(activeRole.id, {
        name: activeRole.name,
        description: activeRole.description,
        permission_ids: Array.from(selectedRolePermIds),
      });
      toast.success(t('access.saveSuccess'));
      await loadData();
    } catch (err: any) {
      const msg = err?.response?.data?.error || t('common.errorOccurred');
      toast.error(msg);
    } finally {
      setIsSavingPerms(false);
    }
  };

  // Filtered users
  const filteredUsers = useMemo(() => {
    const q = userSearch.toLowerCase().trim();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        (u.full_name && u.full_name.toLowerCase().includes(q)) ||
        (u.role_info && u.role_info.name.toLowerCase().includes(q))
    );
  }, [users, userSearch]);

  const getRoleDisplayName = (r: { code?: string; name?: string }) => {
    if (r.code === 'admin') return t('access.roleAdmin');
    if (r.code === 'operator') return t('access.roleOperator');
    if (r.code === 'viewer') return t('access.roleViewer');
    return r.name || r.code || '';
  };

  const getPermissionName = (perm: Permission) => {
    const key = `perm.${perm.code}.name` as const;
    // @ts-expect-error dynamic i18n key lookup
    const translated = t(key);
    return translated !== key ? translated : perm.name;
  };

  const getPermissionDesc = (perm: Permission) => {
    const key = `perm.${perm.code}.desc` as const;
    // @ts-expect-error dynamic i18n key lookup
    const translated = t(key);
    return translated !== key ? translated : perm.description;
  };

  const getRoleBadge = (roleCode?: string, roleName?: string) => {
    const code = roleCode || 'viewer';
    const name = getRoleDisplayName({ code, name: roleName });
    switch (code) {
      case 'admin':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            <Shield size={12} />
            {name}
          </span>
        );
      case 'operator':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <UserCheck size={12} />
            {name}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
            {name}
          </span>
        );
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-slate-200/80 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-500/10 text-orange-600 flex items-center justify-center">
              <Shield size={20} />
            </div>
            <h1 className="text-xl font-bold text-slate-800">{t('access.title')}</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">{t('access.subtitle')}</p>
        </div>

        {/* Tab Switcher & Action Buttons */}
        <div className="flex items-center gap-3">
          <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1">
            <button
              onClick={() => setActiveTab('users')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${activeTab === 'users'
                ? 'bg-white text-slate-800 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
                }`}
            >
              {t('access.tabUsers')} ({users.length})
            </button>
            <button
              onClick={() => setActiveTab('roles')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${activeTab === 'roles'
                ? 'bg-white text-slate-800 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
                }`}
            >
              {t('access.tabRoles')} ({roles.length})
            </button>
          </div>

          {activeTab === 'users' ? (
            <button
              onClick={handleOpenCreateUser}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Plus size={16} />
              {t('access.addUser')}
            </button>
          ) : (
            <button
              onClick={handleOpenCreateRole}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Plus size={16} />
              {t('access.addRole')}
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400">
            <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mb-3" />
            <span className="text-sm font-medium">{t('loading')}</span>
          </div>
        ) : activeTab === 'users' ? (
          /* ── TAB 1: USERS ─────────────────────────────────────────────── */
          <div className="space-y-4 max-w-6xl mx-auto">
            {/* Search toolbar */}
            <div className="flex items-center justify-between gap-4">
              <div className="relative w-full max-w-md">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder={`${t('search')}...`}
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all shadow-xs"
                />
              </div>
              <span className="text-xs text-slate-500 font-medium">
                {t('access.userCount', { count: filteredUsers.length })}
              </span>
            </div>

            {/* Users Table */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider font-semibold">
                      <th className="px-5 py-3.5">{t('access.fullName')} / {t('access.username')}</th>
                      <th className="px-5 py-3.5">{t('access.role')}</th>
                      <th className="px-5 py-3.5">{t('access.status')}</th>
                      <th className="px-5 py-3.5">{t('access.lastLogin')}</th>
                      <th className="px-5 py-3.5 text-right">{t('access.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-5 py-12 text-center text-slate-400">
                          {t('noData')}
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((u) => {
                        const roleObj = u.role_info || roles.find((r) => r.id === u.role_id);
                        const isSelf = currentUser?.id === u.id;
                        const isDefaultAdmin = u.username === 'admin';

                        return (
                          <tr key={u.id} className="hover:bg-slate-50/60 transition-colors">
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 font-bold flex items-center justify-center text-sm uppercase">
                                  {u.full_name ? u.full_name.charAt(0) : u.username.charAt(0)}
                                </div>
                                <div>
                                  <div className="font-semibold text-slate-800 flex items-center gap-2">
                                    {u.full_name || u.username}
                                    {isSelf && (
                                      <span className="text-[10px] font-semibold bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-md">
                                        {t('access.you')}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-slate-400">@{u.username}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-3.5">
                              {getRoleBadge(roleObj?.code || u.role, roleObj?.name)}
                            </td>
                            <td className="px-5 py-3.5">
                              {u.is_active ? (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                                  <CheckCircle2 size={12} />
                                  {t('access.active')}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-100">
                                  <Ban size={12} />
                                  {t('access.inactive')}
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-3.5 text-xs text-slate-500">
                              {u.last_login_at
                                ? new Date(u.last_login_at).toLocaleString()
                                : t('access.never')}
                            </td>
                            <td className="px-5 py-3.5 text-right">
                              <div className="inline-flex items-center gap-1">
                                <button
                                  onClick={() => handleOpenEditUser(u)}
                                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                                  title={t('access.editUser')}
                                >
                                  <Edit2 size={16} />
                                </button>
                                <button
                                  onClick={() => {
                                    setUserToResetPassword(u);
                                    setNewPassword('');
                                    setResetPasswordModalOpen(true);
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                                  title={t('access.resetPassword')}
                                >
                                  <KeyRound size={16} />
                                </button>
                                {!isSelf && !isDefaultAdmin && (
                                  <button
                                    onClick={() => setPendingToggleBlockUser(u)}
                                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${u.is_active
                                      ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                                      : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                                      }`}
                                    title={u.is_active ? t('access.blockUser') : t('access.unblockUser')}
                                  >
                                    {u.is_active ? <Ban size={16} /> : <UserCheck size={16} />}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          /* ── TAB 2: ROLES & PERMISSIONS MATRIX ──────────────────────────── */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-6xl mx-auto">
            {/* Left Column: Roles list */}
            <div className="lg:col-span-4 space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {t('access.tabRoles')}
                </span>
                <span className="text-xs text-slate-400 font-medium">
                  {t('access.roleCount', { count: roles.length })}
                </span>
              </div>

              <div className="space-y-2">
                {roles.map((r) => {
                  const isSelected = r.id === activeRole?.id;
                  return (
                    <div
                      key={r.id}
                      onClick={() => setSelectedRoleId(r.id)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${isSelected
                        ? 'bg-white border-orange-500 shadow-md shadow-orange-500/5 ring-2 ring-orange-500/10'
                        : 'bg-white/80 border-slate-200/80 hover:bg-white hover:border-slate-300 shadow-xs'
                        }`}
                    >
                      <div className="min-w-0 flex-1 pr-3">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-sm text-slate-800 truncate">{getRoleDisplayName(r)}</h4>
                          {r.is_system ? (
                            <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-md">
                              {t('access.systemRole')}
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded-md">
                              {t('access.customRole')}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-1 line-clamp-1">
                          {r.description || `code: ${r.code}`}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {!r.is_system && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setPendingDeleteRoleId(r.id);
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title={t('common.delete')}
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Column: Permissions Matrix */}
            <div className="lg:col-span-8 bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs flex flex-col">
              {activeRole ? (
                <>
                  {/* Role Header */}
                  <div className="border-b border-slate-100 pb-5 mb-6 flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <h2 className="text-lg font-bold text-slate-800">{getRoleDisplayName(activeRole)}</h2>
                        <code className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">
                          {activeRole.code}
                        </code>
                      </div>
                      <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                        {activeRole.description || t('access.subtitle')}
                      </p>
                    </div>

                    {activeRole.code !== 'admin' && (
                      <button
                        onClick={handleSaveRolePermissions}
                        disabled={isSavingPerms}
                        className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        {isSavingPerms ? (
                          <span className="w-3.5 h-3.5 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Check size={16} />
                        )}
                        {t('save')}
                      </button>
                    )}
                  </div>

                  {/* Admin notice */}
                  {activeRole.code === 'admin' && (
                    <div className="mb-6 p-4 rounded-2xl bg-purple-50 border border-purple-100 flex items-center gap-3 text-purple-800 text-xs">
                      <Lock size={18} className="shrink-0 text-purple-600" />
                      <span>
                        {t('access.adminNotice', { name: getRoleDisplayName(activeRole) })}
                      </span>
                    </div>
                  )}

                  {/* Permissions modules */}
                  <div className="space-y-6 flex-1">
                    {Array.from(permissionsByModule.entries()).map(([moduleName, perms]) => {
                      const allSelected = perms.every((p) => selectedRolePermIds.has(p.id));
                      const isAdmin = activeRole.code === 'admin';

                      return (
                        <div key={moduleName} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
                          <div className="flex items-center justify-between mb-3.5 pb-2.5 border-b border-slate-200/60">
                            <div className="flex items-center gap-2 font-bold text-sm text-slate-800">
                              {getModuleIcon(moduleName)}
                              <span>{getModuleTitle(moduleName)}</span>
                            </div>

                            {!isAdmin && (
                              <button
                                type="button"
                                onClick={() => handleToggleModuleAll(moduleName)}
                                className="text-xs font-semibold text-orange-600 hover:text-orange-700 cursor-pointer transition-colors"
                              >
                                {allSelected ? t('access.deselectAllModule') : t('access.selectAllModule')}
                              </button>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {perms.map((perm) => {
                              const isChecked = isAdmin || selectedRolePermIds.has(perm.id);

                              return (
                                <label
                                  key={perm.id}
                                  onClick={() => handleTogglePermission(perm.id)}
                                  className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${isChecked
                                    ? 'bg-white border-orange-500/40 shadow-xs'
                                    : 'bg-white/60 border-slate-200/60 opacity-60 hover:opacity-100'
                                    } ${isAdmin ? 'cursor-default' : ''}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    disabled={isAdmin}
                                    onChange={() => { }}
                                    className="mt-0.5 h-4 w-4 rounded-md border-slate-300 text-orange-600 focus:ring-orange-500 cursor-pointer disabled:cursor-default"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="text-xs font-bold text-slate-800">{getPermissionName(perm)}</div>
                                    <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                                      {getPermissionDesc(perm) || perm.code}
                                    </div>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="text-center py-12 text-slate-400 text-sm">
                  {t('noData')}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── MODALS ───────────────────────────────────────────────────────────── */}

      {/* 1. Create/Edit User Modal */}
      {userModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-800">
                {editingUser ? t('access.editUser') : t('access.addUser')}
              </h3>
              <button
                onClick={() => setUserModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  {t('access.username')} {!editingUser && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="text"
                  required
                  disabled={!!editingUser}
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value)}
                  placeholder="e.g. guard01"
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 disabled:bg-slate-100 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  {t('access.fullName')}
                </label>
                <input
                  type="text"
                  value={formFullName}
                  onChange={(e) => setFormFullName(e.target.value)}
                  placeholder="e.g. Nguyễn Văn A"
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>

              {!editingUser && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    {t('access.initialPassword')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder={t('access.min6Chars')}
                    className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  {t('access.role')}
                </label>
                <select
                  value={formRoleId}
                  onChange={(e) => setFormRoleId(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {getRoleDisplayName(r)} ({r.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                    className="w-4 h-4 text-orange-600 rounded-md border-slate-300 focus:ring-orange-500"
                  />
                  <span className="text-xs font-semibold text-slate-700">
                    {t('access.activeAccount')}
                  </span>
                </label>
              </div>

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setUserModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingUser}
                  className="px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {isSubmittingUser && (
                    <span className="w-3 h-3 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                  )}
                  {t('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Reset Password Modal */}
      {resetPasswordModalOpen && userToResetPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-800">{t('access.resetPassword')}</h3>
              <button
                onClick={() => setResetPasswordModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleResetPasswordSubmit} className="p-6 space-y-4">
              <p className="text-xs text-slate-500">
                {t('access.resetPasswordFor', { username: userToResetPassword.username })}
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  {t('access.newPassword')}
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t('access.min6Chars')}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setResetPasswordModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  {t('access.resetPassword')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Create Role Modal */}
      {roleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-800">{t('access.addRole')}</h3>
              <button
                onClick={() => setRoleModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveRole} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  {t('access.roleName')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formRoleName}
                  onChange={(e) => setFormRoleName(e.target.value)}
                  placeholder="e.g. Security Guard"
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  {t('access.roleCode')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formRoleCode}
                  onChange={(e) => setFormRoleCode(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                  placeholder="e.g. security_guard"
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  {t('access.description')}
                </label>
                <textarea
                  rows={3}
                  value={formRoleDesc}
                  onChange={(e) => setFormRoleDesc(e.target.value)}
                  placeholder={t('access.roleDescPlaceholder')}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setRoleModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingRole}
                  className="px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {isSubmittingRole && (
                    <span className="w-3 h-3 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                  )}
                  {t('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Block / Unblock User Confirm */}
      <ConfirmDialog
        isOpen={!!pendingToggleBlockUser}
        title={pendingToggleBlockUser?.is_active ? t('access.blockUser') : t('access.unblockUser')}
        message={
          pendingToggleBlockUser?.is_active
            ? t('access.confirmBlockUser', { username: pendingToggleBlockUser?.username || '' })
            : t('access.confirmUnblockUser', { username: pendingToggleBlockUser?.username || '' })
        }
        confirmLabel={pendingToggleBlockUser?.is_active ? t('access.blockUser') : t('access.unblockUser')}
        cancelLabel={t('common.cancel')}
        variant={pendingToggleBlockUser?.is_active ? 'danger' : 'primary'}
        onConfirm={handleToggleBlockUser}
        onCancel={() => setPendingToggleBlockUser(null)}
      />

      {/* Delete Role Confirm */}
      <ConfirmDialog
        isOpen={!!pendingDeleteRoleId}
        title={t('common.delete')}
        message={t('access.confirmDeleteRole', {
          name: roles.find((r) => r.id === pendingDeleteRoleId)?.name || '',
        })}
        onConfirm={handleDeleteRole}
        onCancel={() => setPendingDeleteRoleId(null)}
      />
    </div>
  );
};

export default AccessControl;
