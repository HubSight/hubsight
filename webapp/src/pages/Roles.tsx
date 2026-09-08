import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Shield,
  Plus,
  X,
  Trash2,
  Camera,
  Users,
  Video,
  Activity,
  Sliders,
  Check,
} from '@/components/icons';
import { api } from '../api/client';
import type { Role, Permission } from '@hubsight/sdk';
import { useTranslation } from '../i18n';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import toast from 'react-hot-toast';

export const Roles: React.FC = () => {
  const { t } = useTranslation();

  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Selected Role & Permissions state
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [formRoleName, setFormRoleName] = useState('');
  const [formRoleCode, setFormRoleCode] = useState('');
  const [formRoleDesc, setFormRoleDesc] = useState('');
  const [isSubmittingRole, setIsSubmittingRole] = useState(false);
  const [selectedRolePermIds, setSelectedRolePermIds] = useState<Set<string>>(new Set());
  const [isSavingPerms, setIsSavingPerms] = useState(false);
  const [pendingDeleteRoleId, setPendingDeleteRoleId] = useState<string | null>(null);

  // Load roles and permissions
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [rList, pList] = await Promise.all([
        api.roles.list(),
        api.permissions.list(),
      ]);
      setRoles(rList);
      setPermissions(pList);
      setSelectedRoleId((prev) => {
        if (prev && rList.some((r) => r.id === prev)) return prev;
        return rList.length > 0 ? rList[0].id : '';
      });
    } catch (err) {
      console.error('Failed to load roles and permissions:', err);
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

  const handleToggleModuleAll = (modulePerms: Permission[]) => {
    if (!activeRole || activeRole.code === 'admin') return;
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

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center">
              <Shield size={20} />
            </div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{t('roles.title')}</h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t('roles.subtitle')}</p>
        </div>

        <button
          onClick={handleOpenCreateRole}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-xl shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Plus size={16} />
          {t('access.addRole')}
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400 dark:text-slate-500">
            <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mb-3" />
            <span className="text-sm font-medium">{t('loading')}</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-6xl mx-auto">
            {/* Left Column: Roles list */}
            <div className="lg:col-span-4 space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {t('access.tabRoles')}
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">
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
                        ? 'bg-white dark:bg-slate-900 border-orange-500 shadow-md shadow-orange-500/5 ring-2 ring-orange-500/10'
                        : 'bg-white/80 dark:bg-slate-900/80 border-slate-200/80 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs'
                        }`}
                    >
                      <div className="min-w-0 flex-1 pr-3">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">{getRoleDisplayName(r)}</h4>
                          {r.is_system ? (
                            <span className="text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded-md">
                              {t('access.systemRole')}
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 px-1.5 py-0.5 rounded-md">
                              {t('access.customRole')}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 line-clamp-1">
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
                            className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
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
            <div className="lg:col-span-8 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6 shadow-xs flex flex-col">
              {activeRole ? (
                <>
                  {/* Role Header */}
                  <div className="border-b border-slate-100 dark:border-slate-800 pb-5 mb-6 flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">{getRoleDisplayName(activeRole)}</h2>
                        {activeRole.is_system ? (
                          <span className="text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-md">
                            {t('access.systemRole')}
                          </span>
                        ) : (
                          <span className="text-xs font-semibold bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 px-2 py-0.5 rounded-md">
                            {t('access.customRole')}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                        {activeRole.description || `${t('access.roleCode')}: ${activeRole.code}`}
                      </p>
                    </div>

                    {activeRole.code !== 'admin' && (
                      <button
                        onClick={handleSaveRolePermissions}
                        disabled={isSavingPerms}
                        className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        {isSavingPerms && (
                          <span className="w-3 h-3 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                        )}
                        {t('save')}
                      </button>
                    )}
                  </div>

                  {/* Permissions Checklist */}
                  {activeRole.code === 'admin' ? (
                    <div className="p-4 bg-purple-50/60 dark:bg-purple-950/30 border border-purple-100 dark:border-purple-900/50 rounded-2xl text-purple-800 dark:text-purple-300 text-xs flex items-center gap-3">
                      <Shield size={20} className="shrink-0 text-purple-600 dark:text-purple-400" />
                      <span>{t('access.adminNotice', { name: getRoleDisplayName(activeRole) })}</span>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {Array.from(permissionsByModule.entries()).map(([mod, perms]) => {
                        const allSelected = perms.every((p) => selectedRolePermIds.has(p.id));
                        return (
                          <div key={mod} className="border border-slate-100 dark:border-slate-800 rounded-2xl p-4.5 bg-slate-50/50 dark:bg-slate-800/40">
                            <div className="flex items-center justify-between mb-3 border-b border-slate-100 dark:border-slate-700/60 pb-2.5">
                              <div className="flex items-center gap-2">
                                {getModuleIcon(mod)}
                                <h3 className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-200">
                                  {getModuleTitle(mod)}
                                </h3>
                              </div>
                              <button
                                onClick={() => handleToggleModuleAll(perms)}
                                className="text-[11px] font-semibold text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 cursor-pointer"
                              >
                                {allSelected ? t('access.deselectAllModule') : t('access.selectAllModule')}
                              </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              {perms.map((perm) => {
                                const checked = selectedRolePermIds.has(perm.id);
                                return (
                                  <div
                                    key={perm.id}
                                    onClick={() => handleTogglePermission(perm.id)}
                                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-2.5 select-none ${checked
                                      ? 'bg-white dark:bg-slate-800 border-orange-400/80 dark:border-orange-500/80 shadow-2xs'
                                      : 'bg-white/60 dark:bg-slate-800/60 border-slate-200/60 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600'
                                      }`}
                                  >
                                    <div
                                      className={`w-4.5 h-4.5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${checked
                                        ? 'bg-orange-600 border-orange-600 text-white'
                                        : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900'
                                        }`}
                                    >
                                      {checked && <Check size={12} strokeWidth={3} />}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-tight">
                                        {getPermissionName(perm)}
                                      </p>
                                      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 leading-snug">
                                        {getPermissionDesc(perm)}
                                      </p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-slate-500">
                  <span className="text-sm font-medium">{t('noData')}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── MODALS ── */}

      {/* Create Role Modal */}
      {roleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-800 dark:text-slate-100">{t('access.addRole')}</h3>
              <button
                onClick={() => setRoleModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveRole} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  {t('access.roleName')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formRoleName}
                  onChange={(e) => setFormRoleName(e.target.value)}
                  placeholder="e.g. Security Guard"
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  {t('access.roleCode')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formRoleCode}
                  onChange={(e) => setFormRoleCode(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                  placeholder="e.g. security_guard"
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  {t('access.description')}
                </label>
                <textarea
                  rows={3}
                  value={formRoleDesc}
                  onChange={(e) => setFormRoleDesc(e.target.value)}
                  placeholder={t('access.roleDescPlaceholder')}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setRoleModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
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

export default Roles;
