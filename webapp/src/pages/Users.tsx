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
    if (!userToResetPassword) return;
    try {
      await api.users.resetPassword(userToResetPassword.id, newPassword, resetMustChangePassword);
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
    const willBlock = target.is_active;
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
              <UserCog size={20} />
            </div>
            <h1 className="text-xl font-bold text-slate-800">{t('users.title')}</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">{t('users.subtitle')}</p>
        </div>

        <button
          onClick={handleOpenCreateUser}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-xl shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Plus size={16} />
          {t('access.addUser')}
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400">
            <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mb-3" />
            <span className="text-sm font-medium">{t('loading')}</span>
          </div>
        ) : (
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
                              <div className="flex flex-col gap-1 items-start">
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
                                {u.must_change_password && (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md border border-amber-200" title={t('access.requirePasswordChangeDesc')}>
                                    <KeyRound size={10} />
                                    {t('access.mustChangePasswordBadge')}
                                  </span>
                                )}
                              </div>
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
        )}
      </div>

      {/* ── MODALS ── */}

      {/* 1. Create / Edit User Modal */}
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
                  onChange={(e) => setFormUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                  placeholder="e.g. johndoe"
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 disabled:opacity-60 font-mono"
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
                  placeholder="e.g. John Doe"
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
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 cursor-pointer"
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
                    className="w-4 h-4 text-orange-600 border-slate-300 rounded-sm focus:ring-orange-500"
                  />
                  <label htmlFor="userActive" className="text-xs font-medium text-slate-700 cursor-pointer select-none">
                    {t('access.activeAccount')}
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="userMustChangePassword"
                    checked={formMustChangePassword}
                    onChange={(e) => setFormMustChangePassword(e.target.checked)}
                    className="w-4 h-4 text-orange-600 border-slate-300 rounded-sm focus:ring-orange-500"
                  />
                  <label htmlFor="userMustChangePassword" className="text-xs font-medium text-slate-700 cursor-pointer select-none">
                    {t('access.requirePasswordChangeOnLogin')}
                  </label>
                </div>
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

              <div className="pt-1 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="resetMustChangePassword"
                  checked={resetMustChangePassword}
                  onChange={(e) => setResetMustChangePassword(e.target.checked)}
                  className="w-4 h-4 text-orange-600 border-slate-300 rounded-sm focus:ring-orange-500"
                />
                <label htmlFor="resetMustChangePassword" className="text-xs font-medium text-slate-700 cursor-pointer select-none">
                  {t('access.requirePasswordChangeOnLogin')}
                </label>
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
        onConfirm={handleToggleBlockUser}
        onCancel={() => setPendingToggleBlockUser(null)}
      />
    </div>
  );
};

export default Users;
