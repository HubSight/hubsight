import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  UserCog,
  Search,
  Plus,
  Edit2,
  KeyRound,
  Ban,
  UserCheck,
  CheckCircle2,
  X,
  Shield,
} from '@/components/icons';
import { api } from '../api/client';
import type { User, Role } from '@hubsight/sdk';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../i18n';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { PageHeader } from '../components/common/PageHeader';
import toast from 'react-hot-toast';

export const Users: React.FC = () => {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Search & Filter
  const [userSearch, setUserSearch] = useState('');

  // Modals
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
  const [formMustChangePassword, setFormMustChangePassword] = useState(true);
  const [resetMustChangePassword, setResetMustChangePassword] = useState(true);
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);
  const [isSubmittingResetPassword, setIsSubmittingResetPassword] = useState(false);
  const [isTogglingBlock, setIsTogglingBlock] = useState(false);

  // Load users and roles
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [uList, rList] = await Promise.all([
        api.users.list(),
        api.roles.list(),
      ]);
      setUsers(uList);
      setRoles(rList);
    } catch (err) {
      console.error('Failed to load users data:', err);
      toast.error(t('common.errorOccurred'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Actions
  const handleOpenCreateUser = () => {
    setEditingUser(null);
    setFormUsername('');
    setFormFullName('');
    setFormPassword('');
    setFormRoleId(roles.find((r) => r.code === 'viewer')?.id || roles[0]?.id || '');
    setFormIsActive(true);
    setFormMustChangePassword(true);
    setUserModalOpen(true);
  };

  const handleOpenEditUser = (u: User) => {
    setEditingUser(u);
    setFormUsername(u.username);
    setFormFullName(u.full_name || '');
    setFormRoleId(u.role_id || '');
    setFormIsActive(u.is_active);
    setFormMustChangePassword(u.must_change_password ?? false);
    setUserModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingUser) return;
    setIsSubmittingUser(true);
    try {
      if (editingUser) {
        await api.users.update(editingUser.id, {
          full_name: formFullName,
          role_id: formRoleId || undefined,
          is_active: formIsActive,
          must_change_password: formMustChangePassword,
        });
        toast.success(t('access.saveSuccess'));
      } else {
        await api.users.create({
          username: formUsername,
          full_name: formFullName,
          password: formPassword,
          role_id: formRoleId || undefined,
          is_active: formIsActive,
          must_change_password: formMustChangePassword,
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
    if (!userToResetPassword || isSubmittingResetPassword) return;
    setIsSubmittingResetPassword(true);
    try {
      await api.users.resetPassword(userToResetPassword.id, newPassword, resetMustChangePassword);
      toast.success(t('access.resetPasswordSuccess'));
      setResetPasswordModalOpen(false);
      setNewPassword('');
    } catch (err: any) {
      const msg = err?.response?.data?.error || t('common.errorOccurred');
      toast.error(msg);
    } finally {
      setIsSubmittingResetPassword(false);
    }
  };

  const handleToggleBlockUser = async () => {
    if (!pendingToggleBlockUser || isTogglingBlock) return;
    const target = pendingToggleBlockUser;
    const willBlock = target.is_active;
    setIsTogglingBlock(true);
    try {
      await api.users.block(target.id, willBlock);
      toast.success(willBlock ? t('access.blockUserSuccess') : t('access.unblockUserSuccess'));
      setPendingToggleBlockUser(null);
      await loadData();
    } catch (err: any) {
      const msg = err?.response?.data?.error || t('common.errorOccurred');
      toast.error(msg);
    } finally {
      setIsTogglingBlock(false);
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

  const getRoleBadge = (roleCode?: string, roleName?: string) => {
    const code = roleCode || 'viewer';
    const name = getRoleDisplayName({ code, name: roleName });
    switch (code) {
      case 'admin':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
            <Shield size={12} />
            {name}
          </span>
        );
      case 'operator':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            <UserCheck size={12} />
            {name}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            {name}
          </span>
        );
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50/50 dark:bg-slate-950/50 overflow-hidden">
      {/* ── Standard Unified Page Header ─────────────────────────────── */}
      <PageHeader
        icon={UserCog}
        title={t('users.title')}
        subtitle={t('users.subtitle')}
        badge={
          users.length > 0 ? (
            <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700/80">
              {users.length}
            </span>
          ) : undefined
        }
        actions={
          <button
            onClick={handleOpenCreateUser}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 active:scale-98 rounded-lg shadow-2xs transition-all cursor-pointer shrink-0 whitespace-nowrap"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">{t('access.addUser')}</span>
            <span className="sm:hidden">{t('users.addShort')}</span>
          </button>
        }
      />

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 pb-20">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400 dark:text-slate-500">
            <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mb-3" />
            <span className="text-sm font-medium">{t('loading')}</span>
          </div>
        ) : (
          <div className="space-y-4 w-full">
            {/* Search toolbar */}
            <div className="flex items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <input
                  type="text"
                  placeholder={`${t('search')}...`}
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all shadow-xs"
                />
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium shrink-0">
                {t('access.userCount', { count: filteredUsers.length })}
              </span>
            </div>

            {filteredUsers.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-8 text-center text-slate-400 dark:text-slate-500">
                {t('noData')}
              </div>
            ) : (
              <>
                {/* ── MOBILE VIEW: Touch-Friendly Card List ── */}
                <div className="block md:hidden space-y-3">
                  {filteredUsers.map((u) => {
                    const roleObj = u.role_info || roles.find((r) => r.id === u.role_id);
                    const isSelf = currentUser?.id === u.id;
                    const isDefaultAdmin = u.username === 'admin';

                    return (
                      <div
                        key={`mobile-${u.id}`}
                        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-2xs space-y-3"
                      >
                        {/* Top: Avatar, Name, Username, Self badge & Status badge */}
                        <div className="flex items-start justify-between gap-2.5">
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold flex items-center justify-center text-sm uppercase shrink-0">
                              {u.full_name ? u.full_name.charAt(0) : u.username.charAt(0)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-1.5 flex-wrap">
                                <span className="truncate">{u.full_name || u.username}</span>
                                {isSelf && (
                                  <span className="text-[10px] font-semibold bg-orange-100 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300 px-1.5 py-0.5 rounded-md shrink-0">
                                    {t('access.you')}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-400 dark:text-slate-500 truncate">@{u.username}</div>
                            </div>
                          </div>

                          {/* Status Badge */}
                          <div className="shrink-0">
                            {u.is_active ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-100 dark:border-emerald-800">
                                <CheckCircle2 size={11} />
                                {t('access.active')}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-md border border-rose-100 dark:border-rose-800">
                                <Ban size={11} />
                                {t('access.inactive')}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Middle: Role Badge & Metadata */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100/80 dark:border-slate-800 text-xs">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {getRoleBadge(roleObj?.code || u.role, roleObj?.name)}
                            {u.must_change_password && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded-md border border-amber-200 dark:border-amber-800">
                                <KeyRound size={10} />
                                {t('access.mustChangePasswordBadge')}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400 dark:text-slate-500">
                            {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : t('access.never')}
                          </span>
                        </div>

                        {/* Bottom: Actions Row */}
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEditUser(u)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer border border-slate-200/80 dark:border-slate-700"
                          >
                            <Edit2 size={13} />
                            <span>{t('edit')}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setUserToResetPassword(u);
                              setNewPassword('');
                              setResetPasswordModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/40 rounded-xl transition-colors cursor-pointer border border-amber-200/80 dark:border-amber-800"
                          >
                            <KeyRound size={13} />
                            <span>{t('nav.changePassword')}</span>
                          </button>
                          {!isSelf && !isDefaultAdmin && (
                            <button
                              type="button"
                              onClick={() => setPendingToggleBlockUser(u)}
                              className={`p-1.5 rounded-xl transition-colors cursor-pointer border ${
                                u.is_active
                                  ? 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/40 border-rose-200/80 dark:border-rose-800'
                                  : 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 border-emerald-200/80 dark:border-emerald-800'
                              }`}
                              title={u.is_active ? t('access.blockUser') : t('access.unblockUser')}
                              aria-label={u.is_active ? t('access.blockUser') : t('access.unblockUser')}
                            >
                              {u.is_active ? <Ban size={14} /> : <UserCheck size={14} />}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ── DESKTOP VIEW: Table ── */}
                <div className="hidden md:block bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="bg-slate-50/80 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">
                          <th className="px-5 py-3.5">{t('access.fullName')} / {t('access.username')}</th>
                          <th className="px-5 py-3.5">{t('access.role')}</th>
                          <th className="px-5 py-3.5">{t('access.status')}</th>
                          <th className="px-5 py-3.5">{t('access.lastLogin')}</th>
                          <th className="px-5 py-3.5 text-right">{t('access.actions')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredUsers.map((u) => {
                          const roleObj = u.role_info || roles.find((r) => r.id === u.role_id);
                          const isSelf = currentUser?.id === u.id;
                          const isDefaultAdmin = u.username === 'admin';

                          return (
                            <tr key={u.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/50 transition-colors">
                              <td className="px-5 py-3.5">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold flex items-center justify-center text-sm uppercase">
                                    {u.full_name ? u.full_name.charAt(0) : u.username.charAt(0)}
                                  </div>
                                  <div>
                                    <div className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                                      {u.full_name || u.username}
                                      {isSelf && (
                                        <span className="text-[10px] font-semibold bg-orange-100 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300 px-1.5 py-0.5 rounded-md">
                                          {t('access.you')}
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-xs text-slate-400 dark:text-slate-500">@{u.username}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-5 py-3.5">
                                {getRoleBadge(roleObj?.code || u.role, roleObj?.name)}
                              </td>
                              <td className="px-5 py-3.5">
                                <div className="flex flex-col gap-1 items-start">
                                  {u.is_active ? (
                                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-100 dark:border-emerald-800">
                                      <CheckCircle2 size={12} />
                                      {t('access.active')}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-md border border-rose-100 dark:border-rose-800">
                                      <Ban size={12} />
                                      {t('access.inactive')}
                                    </span>
                                  )}
                                  {u.must_change_password && (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded-md border border-amber-200 dark:border-amber-800" title={t('access.requirePasswordChangeDesc')}>
                                      <KeyRound size={10} />
                                      {t('access.mustChangePasswordBadge')}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-5 py-3.5 text-xs text-slate-500 dark:text-slate-400">
                                {u.last_login_at
                                  ? new Date(u.last_login_at).toLocaleString()
                                  : t('access.never')}
                              </td>
                              <td className="px-5 py-3.5 text-right">
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    onClick={() => handleOpenEditUser(u)}
                                    className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
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
                                    className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-lg transition-colors cursor-pointer"
                                    title={t('access.resetPassword')}
                                  >
                                    <KeyRound size={16} />
                                  </button>
                                  {!isSelf && !isDefaultAdmin && (
                                    <button
                                      onClick={() => setPendingToggleBlockUser(u)}
                                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${u.is_active
                                        ? 'text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                                        : 'text-slate-400 dark:text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
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
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── MODALS ── */}

      {/* 1. Create / Edit User Modal */}
      {userModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-800 dark:text-slate-100">
                {editingUser ? t('access.editUser') : t('access.addUser')}
              </h3>
              <button
                onClick={() => setUserModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  {t('access.username')} {!editingUser && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="text"
                  required
                  disabled={!!editingUser}
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                  placeholder="e.g. johndoe"
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 disabled:opacity-60 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  {t('access.fullName')}
                </label>
                <input
                  type="text"
                  value={formFullName}
                  onChange={(e) => setFormFullName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>

              {!editingUser && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                    {t('access.initialPassword')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder={t('access.min6Chars')}
                    className="w-full px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  {t('access.role')}
                </label>
                <select
                  value={formRoleId}
                  onChange={(e) => setFormRoleId(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 cursor-pointer"
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {getRoleDisplayName(r)} ({r.is_system ? t('access.systemRole') : t('access.customRole')})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="userActive"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                    className="w-4 h-4 text-orange-600 border-slate-300 dark:border-slate-600 rounded-sm focus:ring-orange-500"
                  />
                  <label htmlFor="userActive" className="text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                    {t('access.activeAccount')}
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="userMustChangePassword"
                    checked={formMustChangePassword}
                    onChange={(e) => setFormMustChangePassword(e.target.checked)}
                    className="w-4 h-4 text-orange-600 border-slate-300 dark:border-slate-600 rounded-sm focus:ring-orange-500"
                  />
                  <label htmlFor="userMustChangePassword" className="text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                    {t('access.requirePasswordChangeOnLogin')}
                  </label>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setUserModalOpen(false)}
                  disabled={isSubmittingUser}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer disabled:opacity-50"
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
                  {isSubmittingUser ? t('common.saving') : t('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Reset Password Modal */}
      {resetPasswordModalOpen && userToResetPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-800 dark:text-slate-100">{t('access.resetPassword')}</h3>
              <button
                onClick={() => setResetPasswordModalOpen(false)}
                disabled={isSubmittingResetPassword}
                className="p-1 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer disabled:opacity-40"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleResetPasswordSubmit} className="p-6 space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('access.resetPasswordFor', { username: userToResetPassword.username })}
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  {t('access.newPassword')}
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t('access.min6Chars')}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>

              <div className="pt-1 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="resetMustChangePassword"
                  checked={resetMustChangePassword}
                  onChange={(e) => setResetMustChangePassword(e.target.checked)}
                  className="w-4 h-4 text-orange-600 border-slate-300 dark:border-slate-600 rounded-sm focus:ring-orange-500"
                />
                <label htmlFor="resetMustChangePassword" className="text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                  {t('access.requirePasswordChangeOnLogin')}
                </label>
              </div>

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setResetPasswordModalOpen(false)}
                  disabled={isSubmittingResetPassword}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer disabled:opacity-50"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingResetPassword}
                  className="px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {isSubmittingResetPassword && (
                    <span className="w-3 h-3 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                  )}
                  {t('access.resetPassword')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Block / Unblock User Confirm */}
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
        isLoading={isTogglingBlock}
        onConfirm={handleToggleBlockUser}
        onCancel={() => {
          if (!isTogglingBlock) setPendingToggleBlockUser(null);
        }}
      />
    </div>
  );
};

export default Users;
