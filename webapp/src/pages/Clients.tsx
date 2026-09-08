import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  KeyRound,
  Search,
  Plus,
  Edit2,
  Trash2,
  RefreshCw,
  Copy,
  Check,
  Eye,
  EyeOff,
  Smartphone,
  Globe,
  Layers,
  Power,
  PowerOff,
  X,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../api/client';
import type { ApiClient } from '@hubsight/sdk';
import { useTranslation } from '../i18n';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import toast from 'react-hot-toast';

export const Clients: React.FC = () => {
  const { t } = useTranslation();

  const [clients, setClients] = useState<ApiClient[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState<string>('all');

  // Key Visibility & Copy State
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [copiedClientId, setCopiedClientId] = useState<string | null>(null);

  // Modals
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ApiClient | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Confirmations
  const [clientToDelete, setClientToDelete] = useState<ApiClient | null>(null);
  const [clientToRotate, setClientToRotate] = useState<ApiClient | null>(null);
  const [clientToToggle, setClientToToggle] = useState<ApiClient | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formPlatform, setFormPlatform] = useState<string>('flutter_mobile');
  const [formRateLimit, setFormRateLimit] = useState<number>(0);

  // Load clients
  const loadClients = useCallback(async () => {
    setIsLoading(true);
    try {
      const list = await api.clients.list();
      setClients(list);
    } catch (err) {
      console.error('Failed to load clients:', err);
      toast.error(t('common.errorOccurred'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  // Actions
  const handleOpenCreate = () => {
    setEditingClient(null);
    setFormName('');
    setFormPlatform('flutter_mobile');
    setFormRateLimit(0);
    setClientModalOpen(true);
  };

  const handleOpenEdit = (c: ApiClient) => {
    setEditingClient(c);
    setFormName(c.name);
    setFormPlatform(c.platform);
    setFormRateLimit(c.rate_limit_rps || 0);
    setClientModalOpen(true);
  };

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editingClient) {
        await api.clients.update(editingClient.id, {
          name: formName,
          platform: formPlatform,
          rate_limit_rps: Number(formRateLimit) || 0,
        });
        toast.success(t('clients.updateSuccess'));
      } else {
        await api.clients.create({
          name: formName,
          platform: formPlatform,
          rate_limit_rps: Number(formRateLimit) || 0,
        });
        toast.success(t('clients.createSuccess'));
      }
      setClientModalOpen(false);
      loadClients();
    } catch (err: unknown) {
      console.error('Failed to save client:', err);
      toast.error(err instanceof Error ? err.message : t('common.errorOccurred'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleClick = (c: ApiClient) => {
    if (c.is_system && c.is_active) {
      toast.error(t('clients.systemClient') + ': Không thể tắt');
      return;
    }
    if (c.is_active) {
      // Prompt confirmation before turning off (Kill-Switch)
      setClientToToggle(c);
    } else {
      executeToggle(c);
    }
  };

  const executeToggle = async (c: ApiClient) => {
    setIsActionLoading(true);
    try {
      await api.clients.toggle(c.id);
      toast.success(t('clients.toggleSuccess'));
      setClientToToggle(null);
      loadClients();
    } catch (err: unknown) {
      console.error('Failed to toggle client:', err);
      toast.error(err instanceof Error ? err.message : t('common.errorOccurred'));
    } finally {
      setIsActionLoading(false);
    }
  };

  const executeRotate = async () => {
    if (!clientToRotate) return;
    setIsActionLoading(true);
    try {
      await api.clients.rotateKey(clientToRotate.id);
      toast.success(t('clients.rotateSuccess'));
      setClientToRotate(null);
      loadClients();
    } catch (err: unknown) {
      console.error('Failed to rotate client key:', err);
      toast.error(err instanceof Error ? err.message : t('common.errorOccurred'));
    } finally {
      setIsActionLoading(false);
    }
  };

  const executeDelete = async () => {
    if (!clientToDelete) return;
    setIsActionLoading(true);
    try {
      await api.clients.delete(clientToDelete.id);
      toast.success(t('clients.deleteSuccess'));
      setClientToDelete(null);
      loadClients();
    } catch (err: unknown) {
      console.error('Failed to delete client:', err);
      toast.error(err instanceof Error ? err.message : t('common.errorOccurred'));
    } finally {
      setIsActionLoading(false);
    }
  };

  const copyToClipboard = async (text: string, type: 'key' | 'id', id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'key') {
        setCopiedKeyId(id);
        setTimeout(() => setCopiedKeyId(null), 2000);
      } else {
        setCopiedClientId(id);
        setTimeout(() => setCopiedClientId(null), 2000);
      }
      toast.success(t('clients.copySuccess'));
    } catch (err) {
      console.error('Clipboard copy failed:', err);
    }
  };

  const toggleKeyVisibility = (id: string) => {
    setVisibleKeys((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Filtered List
  const filteredClients = useMemo(() => {
    return clients.filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.client_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.api_key.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPlatform = platformFilter === 'all' || c.platform === platformFilter;
      return matchesSearch && matchesPlatform;
    });
  }, [clients, searchQuery, platformFilter]);

  // Statistics
  const stats = useMemo(() => {
    const total = clients.length;
    const active = clients.filter((c) => c.is_active).length;
    const mobile = clients.filter((c) => c.platform === 'flutter_mobile').length;
    const webOrThird = clients.filter(
      (c) => c.platform === 'web_spa' || c.platform === 'third_party',
    ).length;
    return { total, active, mobile, webOrThird };
  }, [clients]);

  const renderPlatformBadge = (platform: string) => {
    switch (platform) {
      case 'flutter_mobile':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/60">
            <Smartphone size={13} />
            {t('clients.platformMobile')}
          </span>
        );
      case 'web_spa':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200/60">
            <Globe size={13} />
            {t('clients.platformWeb')}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
            <Layers size={13} />
            {t('clients.platformThirdParty')}
          </span>
        );
    }
  };

  const formatLastUsed = (dateStr?: string | null) => {
    if (!dateStr) return t('clients.neverUsed');
    try {
      const date = new Date(dateStr);
      return date.toLocaleString();
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-orange-600/10 text-orange-600 flex items-center justify-center font-bold">
                <KeyRound size={22} />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  {t('clients.title')}
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  {t('clients.subtitle')}
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white text-sm font-semibold shadow-sm shadow-orange-600/20 transition-colors cursor-pointer shrink-0"
          >
            <Plus size={16} />
            {t('clients.addClient')}
          </button>
        </div>

        {/* Statistics Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
              <KeyRound size={22} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {t('clients.totalClients')}
              </p>
              <h3 className="text-2xl font-black text-slate-900 mt-0.5">{stats.total}</h3>
            </div>
          </div>

          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <ShieldCheck size={22} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {t('clients.activeClients')}
              </p>
              <h3 className="text-2xl font-black text-emerald-600 mt-0.5">{stats.active}</h3>
            </div>
          </div>

          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <Smartphone size={22} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {t('clients.mobileClients')}
              </p>
              <h3 className="text-2xl font-black text-indigo-600 mt-0.5">{stats.mobile}</h3>
            </div>
          </div>

          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Globe size={22} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {t('clients.webClients')}
              </p>
              <h3 className="text-2xl font-black text-blue-600 mt-0.5">{stats.webOrThird}</h3>
            </div>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search
              size={18}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('clients.searchPlaceholder')}
              className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              aria-label={t('clients.platform')}
              className="px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 cursor-pointer"
            >
              <option value="all">{t('clients.allPlatforms')}</option>
              <option value="flutter_mobile">{t('clients.platformMobile')}</option>
              <option value="web_spa">{t('clients.platformWeb')}</option>
              <option value="third_party">{t('clients.platformThirdParty')}</option>
            </select>
          </div>
        </div>

        {/* Table of Clients */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-bold uppercase tracking-wider text-slate-500 select-none">
                  <th className="px-5 py-3.5">{t('clients.name')}</th>
                  <th className="px-5 py-3.5">{t('clients.platform')}</th>
                  <th className="px-5 py-3.5">{t('clients.clientId')}</th>
                  <th className="px-5 py-3.5">{t('clients.apiKey')}</th>
                  <th className="px-5 py-3.5">{t('clients.rateLimit')}</th>
                  <th className="px-5 py-3.5">{t('clients.lastUsed')}</th>
                  <th className="px-5 py-3.5 text-center">{t('clients.status')}</th>
                  <th className="px-5 py-3.5 text-right">{t('clients.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center text-slate-400">
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                        <span className="text-xs">{t('loading')}</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredClients.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center text-slate-400">
                      <div className="flex flex-col items-center gap-1.5">
                        <KeyRound size={28} className="text-slate-300" />
                        <p className="text-sm font-medium text-slate-600">
                          {t('clients.empty')}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredClients.map((client) => {
                    const isKeyVisible = !!visibleKeys[client.id];
                    const isKeyCopied = copiedKeyId === client.id;
                    const isIdCopied = copiedClientId === client.id;

                    return (
                      <tr
                        key={client.id}
                        className={`hover:bg-slate-50/75 transition-colors ${
                          !client.is_active ? 'opacity-65 bg-slate-50/30' : ''
                        }`}
                      >
                        {/* Name & System Badge */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900">{client.name}</span>
                            {client.is_system && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                                {t('clients.systemClient')}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Platform */}
                        <td className="px-5 py-4 whitespace-nowrap">
                          {renderPlatformBadge(client.platform)}
                        </td>

                        {/* Client ID */}
                        <td className="px-5 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <code className="text-xs font-mono font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200/80">
                              {client.client_id}
                            </code>
                            <button
                              onClick={() => copyToClipboard(client.client_id, 'id', client.id)}
                              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
                              title="Sao chép Client ID"
                              aria-label="Sao chép Client ID"
                            >
                              {isIdCopied ? (
                                <Check size={13} className="text-emerald-600" />
                              ) : (
                                <Copy size={13} />
                              )}
                            </button>
                          </div>
                        </td>

                        {/* API Key */}
                        <td className="px-5 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <code className="text-xs font-mono font-semibold text-slate-800 bg-orange-50 text-orange-900 border border-orange-200/60 px-2 py-0.5 rounded max-w-[200px] truncate">
                              {isKeyVisible
                                ? client.api_key
                                : client.api_key.substring(0, 10) + '••••••••••••'}
                            </code>
                            <button
                              onClick={() => toggleKeyVisibility(client.id)}
                              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
                              title={isKeyVisible ? 'Ẩn khóa' : 'Hiện khóa'}
                              aria-label={isKeyVisible ? 'Ẩn khóa' : 'Hiện khóa'}
                            >
                              {isKeyVisible ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                            <button
                              onClick={() => copyToClipboard(client.api_key, 'key', client.id)}
                              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
                              title="Sao chép API Key"
                              aria-label="Sao chép API Key"
                            >
                              {isKeyCopied ? (
                                <Check size={13} className="text-emerald-600" />
                              ) : (
                                <Copy size={13} />
                              )}
                            </button>
                          </div>
                        </td>

                        {/* Rate Limit */}
                        <td className="px-5 py-4 whitespace-nowrap text-slate-600 font-medium text-xs">
                          {client.rate_limit_rps > 0
                            ? `${client.rate_limit_rps} RPS`
                            : t('clients.rateLimitUnlimited')}
                        </td>

                        {/* Last Used */}
                        <td className="px-5 py-4 whitespace-nowrap text-xs text-slate-500 font-mono">
                          {formatLastUsed(client.last_used_at)}
                        </td>

                        {/* Status (Kill Switch) */}
                        <td className="px-5 py-4 whitespace-nowrap text-center">
                          <button
                            onClick={() => handleToggleClick(client)}
                            disabled={client.is_system}
                            title={
                              client.is_system
                                ? 'Client hệ thống không thể khóa'
                                : client.is_active
                                ? 'Nhấn để tạm ngắt kết nối (Kill Switch)'
                                : 'Nhấn để kích hoạt lại'
                            }
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                              client.is_system
                                ? 'bg-emerald-100/80 text-emerald-800 cursor-not-allowed opacity-90'
                                : client.is_active
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100'
                                : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                            }`}
                          >
                            {client.is_active ? (
                              <>
                                <Power size={11} />
                                {t('clients.active')}
                              </>
                            ) : (
                              <>
                                <PowerOff size={11} />
                                {t('clients.deactivated')}
                              </>
                            )}
                          </button>
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-4 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setClientToRotate(client)}
                              disabled={client.is_system}
                              title={
                                client.is_system
                                  ? 'Không thể đổi khóa client hệ thống'
                                  : t('clients.rotateKey')
                              }
                              aria-label={t('clients.rotateKey')}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-orange-600 hover:bg-orange-50 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <RefreshCw size={15} />
                            </button>
                            <button
                              onClick={() => handleOpenEdit(client)}
                              title={t('edit')}
                              aria-label={t('edit')}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                            >
                              <Edit2 size={15} />
                            </button>
                            <button
                              onClick={() => setClientToDelete(client)}
                              disabled={client.is_system}
                              title={
                                client.is_system
                                  ? 'Không thể xóa client hệ thống'
                                  : t('delete')
                              }
                              aria-label={t('delete')}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <Trash2 size={15} />
                            </button>
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

      {/* Create / Edit Client Modal */}
      {clientModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center font-bold">
                  <KeyRound size={17} />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  {editingClient
                    ? t('clients.modalEditTitle')
                    : t('clients.modalCreateTitle')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setClientModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveClient} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  {t('clients.name')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={t('clients.namePlaceholder')}
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-medium text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  {t('clients.platform')} <span className="text-red-500">*</span>
                </label>
                <select
                  value={formPlatform}
                  onChange={(e) => setFormPlatform(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-medium text-slate-900 cursor-pointer"
                >
                  <option value="flutter_mobile">{t('clients.platformMobile')}</option>
                  <option value="web_spa">{t('clients.platformWeb')}</option>
                  <option value="third_party">{t('clients.platformThirdParty')}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  {t('clients.rateLimit')}
                </label>
                <input
                  type="number"
                  min="0"
                  max="10000"
                  value={formRateLimit}
                  onChange={(e) => setFormRateLimit(Math.max(0, parseInt(e.target.value) || 0))}
                  placeholder="0"
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-medium text-slate-900"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  {t('clients.rateLimitHelper')}
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setClientModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-xl shadow-sm transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {isSubmitting && (
                    <span className="w-3.5 h-3.5 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
                  )}
                  {isSubmitting ? t('clients.saving') : t('clients.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rotate Key Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!clientToRotate}
        title={t('clients.rotateKeyConfirmTitle')}
        message={t('clients.rotateKeyConfirmMessage')}
        confirmLabel={t('clients.rotateKey')}
        variant="primary"
        isLoading={isActionLoading}
        onConfirm={executeRotate}
        onCancel={() => setClientToRotate(null)}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!clientToDelete}
        title={t('clients.deleteConfirmTitle')}
        message={t('clients.deleteConfirmMessage')}
        confirmLabel={t('delete')}
        variant="danger"
        isLoading={isActionLoading}
        onConfirm={executeDelete}
        onCancel={() => setClientToDelete(null)}
      />

      {/* Kill-switch Toggle Deactivation Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!clientToToggle}
        title={t('clients.toggleConfirmTitle')}
        message={t('clients.toggleConfirmMessage')}
        confirmLabel={t('clients.deactivated')}
        variant="danger"
        isLoading={isActionLoading}
        onConfirm={() => {
          if (clientToToggle) executeToggle(clientToToggle);
        }}
        onCancel={() => setClientToToggle(null)}
      />
    </div>
  );
};

export default Clients;
