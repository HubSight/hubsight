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
  CheckCircle2,
  Ban,
  X,
} from '@/components/icons';
import { api } from '../api/client';
import type { ApiClient } from '@hubsight/sdk';
import { useTranslation } from '../i18n';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { PageHeader } from '../components/common/PageHeader';
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
  const [detailClient, setDetailClient] = useState<ApiClient | null>(null);
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
  const [formPlatform, setFormPlatform] = useState<string>('mobile');
  const [formRateLimit, setFormRateLimit] = useState<number>(0);

  // Load clients
  const loadClients = useCallback(async () => {
    setIsLoading(true);
    try {
      const list = await api.clients.list();
      setClients(list);
      setDetailClient((prev) => (prev ? list.find((c) => c.id === prev.id) || null : null));
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
    setFormPlatform('mobile');
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
    if (isSubmitting) return;
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
      toast.error(t('clients.cannotDisableSystem', { name: t('clients.systemClient') }));
      return;
    }
    if (c.is_active) {
      setClientToToggle(c);
    } else {
      executeToggle(c);
    }
  };

  const executeToggle = async (c: ApiClient) => {
    if (isActionLoading) return;
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
    if (!clientToRotate || isActionLoading) return;
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
    if (!clientToDelete || isActionLoading) return;
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
    const q = searchQuery.toLowerCase().trim();
    return clients.filter((c) => {
      const matchesSearch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.client_id.toLowerCase().includes(q) ||
        c.api_key.toLowerCase().includes(q);
      const matchesPlatform =
        platformFilter === 'all' ||
        c.platform === platformFilter ||
        (platformFilter === 'mobile' && c.platform === 'flutter_mobile');
      return matchesSearch && matchesPlatform;
    });
  }, [clients, searchQuery, platformFilter]);

  const renderPlatformBadge = (platform: string) => {
    switch (platform) {
      case 'mobile':
      case 'flutter_mobile':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shrink-0 whitespace-nowrap">
            <Smartphone size={12} />
            {t('clients.platformMobile')}
          </span>
        );
      case 'web_spa':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shrink-0 whitespace-nowrap">
            <Globe size={12} />
            {t('clients.platformWeb')}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shrink-0 whitespace-nowrap">
            <Layers size={12} />
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
    <div className="flex-1 flex flex-col h-full bg-slate-50/50 dark:bg-slate-950/50 overflow-hidden">
      {/* ── Standard Unified Page Header ─────────────────────────────── */}
      <PageHeader
        icon={KeyRound}
        title={t('clients.title')}
        subtitle={t('clients.subtitle')}
        badge={
          clients.length > 0 ? (
            <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700/80">
              {clients.length}
            </span>
          ) : undefined
        }
        actions={
          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 active:scale-98 rounded-lg shadow-2xs transition-all cursor-pointer whitespace-nowrap"
          >
            <Plus size={16} />
            {t('clients.addClient')}
          </button>
        }
      />

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-3.5 sm:p-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400 dark:text-slate-500">
            <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mb-3" />
            <span className="text-sm font-medium">{t('loading')}</span>
          </div>
        ) : (
          <div className="space-y-4 w-full">
            {/* Search & Filter Toolbar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 flex-1 max-w-2xl">
                <div className="relative flex-1">
                  <Search
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                  />
                  <input
                    type="text"
                    placeholder={t('clients.searchPlaceholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 sm:py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all shadow-xs"
                  />
                </div>
                <select
                  value={platformFilter}
                  onChange={(e) => setPlatformFilter(e.target.value)}
                  aria-label={t('clients.platform')}
                  className="px-3.5 py-2.5 sm:py-2 text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 shadow-xs cursor-pointer shrink-0"
                >
                  <option value="all">{t('clients.allPlatforms')}</option>
                  <option value="mobile">{t('clients.platformMobile')}</option>
                  <option value="web_spa">{t('clients.platformWeb')}</option>
                  <option value="third_party">{t('clients.platformThirdParty')}</option>
                </select>
              </div>

              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium px-1 self-end sm:self-center">
                {t('clients.count', { count: filteredClients.length })}
              </span>
            </div>

            {/* Empty State */}
            {filteredClients.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-8 text-center text-slate-400 dark:text-slate-500">
                {t('noData')}
              </div>
            ) : (
              <>
                {/* ── MOBILE VIEW: Touch-Friendly Card List (Visible on mobile screens) ── */}
                <div className="block md:hidden space-y-3">
                  {filteredClients.map((client) => {
                    const isIdCopied = copiedClientId === client.id;

                    return (
                      <div
                        key={`mobile-${client.id}`}
                        onClick={() => setDetailClient(client)}
                        className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-2xs space-y-3 active:scale-[0.99] transition-all cursor-pointer ${
                          !client.is_active ? 'opacity-75 bg-slate-50/60 dark:bg-slate-900/60' : ''
                        }`}
                      >
                        {/* Top: Icon, App Name, System Badge & Status Badge */}
                        <div className="flex items-start justify-between gap-2.5">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 font-semibold flex items-center justify-center shrink-0">
                              <KeyRound size={18} />
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 flex-wrap">
                                <span className="truncate text-sm">{client.name}</span>
                                {client.is_system && (
                                  <span className="text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 uppercase tracking-wider shrink-0">
                                    {t('clients.systemClient')}
                                  </span>
                                )}
                              </div>
                              <div className="mt-1">
                                {renderPlatformBadge(client.platform)}
                              </div>
                            </div>
                          </div>

                          {/* Status Badge */}
                          <div className="shrink-0">
                            {client.is_active ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-100 dark:border-emerald-800">
                                <CheckCircle2 size={11} />
                                {t('clients.active')}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-md border border-rose-100 dark:border-rose-800">
                                <Ban size={11} />
                                {t('clients.deactivated')}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Client ID with Copy */}
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800/80 px-3 py-2 rounded-xl border border-slate-200/80 dark:border-slate-700"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">ID:</span>
                            <code className="text-xs font-mono font-medium text-slate-700 dark:text-slate-200 truncate">
                              {client.client_id}
                            </code>
                          </div>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(client.client_id, 'id', client.id)}
                            className="px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 rounded-lg shadow-2xs transition-colors cursor-pointer shrink-0 inline-flex items-center gap-1"
                            title={t('clients.copyClientId')}
                          >
                            {isIdCopied ? (
                              <>
                                <Check size={12} className="text-emerald-600 dark:text-emerald-400" />
                                <span className="text-[11px] text-emerald-600 dark:text-emerald-400">{t('clients.copied')}</span>
                              </>
                            ) : (
                              <>
                                <Copy size={12} />
                                <span className="text-[11px]">{t('clients.copy')}</span>
                              </>
                            )}
                          </button>
                        </div>

                        {/* Actions Row */}
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2"
                        >
                          <button
                            type="button"
                            onClick={() => setDetailClient(client)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/40 hover:bg-orange-100 dark:hover:bg-orange-900/40 rounded-xl transition-colors cursor-pointer"
                          >
                            <Eye size={13} />
                            <span>{t('clients.viewDetails')}</span>
                          </button>

                          <div className="flex items-center gap-1">
                            {/* Kill Switch Toggle */}
                            <button
                              type="button"
                              onClick={() => handleToggleClick(client)}
                              disabled={client.is_system}
                              title={
                                client.is_system
                                  ? t('clients.systemCannotLock')
                                  : client.is_active
                                  ? t('clients.deactivateAction')
                                  : t('clients.activateAction')
                              }
                              aria-label={
                                client.is_active
                                  ? t('clients.deactivateAction')
                                  : t('clients.activateAction')
                              }
                              className={`p-2 rounded-xl transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                                client.is_active
                                  ? 'text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                                  : 'text-rose-500 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                              }`}
                            >
                              {client.is_active ? <Ban size={15} /> : <CheckCircle2 size={15} />}
                            </button>

                            {/* Edit */}
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(client)}
                              title={t('edit')}
                              aria-label={t('edit')}
                              className="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                            >
                              <Edit2 size={15} />
                            </button>

                            {/* Delete */}
                            {!client.is_system && (
                              <button
                                type="button"
                                onClick={() => setClientToDelete(client)}
                                title={t('delete')}
                                aria-label={t('delete')}
                                className="p-2 text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors cursor-pointer"
                              >
                                <Trash2 size={15} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ── DESKTOP & TABLET VIEW: Full-Width 5-Column Table ── */}
                <div className="hidden md:block bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="bg-slate-50/80 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">
                          <th className="px-6 py-3.5">{t('clients.name')}</th>
                          <th className="px-6 py-3.5">{t('clients.platform')}</th>
                          <th className="px-6 py-3.5">{t('clients.clientId')}</th>
                          <th className="px-6 py-3.5 text-center">{t('clients.status')}</th>
                          <th className="px-6 py-3.5 text-right">{t('clients.actions')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredClients.map((client) => {
                          const isIdCopied = copiedClientId === client.id;

                          return (
                            <tr
                              key={`desktop-${client.id}`}
                              onClick={() => setDetailClient(client)}
                              className={`group hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors cursor-pointer ${
                                !client.is_active ? 'opacity-60 bg-slate-50/40 dark:bg-slate-900/40' : ''
                              }`}
                            >
                              {/* Application Name & System Badge */}
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 group-hover:bg-orange-100 dark:group-hover:bg-orange-950/40 group-hover:text-orange-600 dark:group-hover:text-orange-400 font-semibold flex items-center justify-center shrink-0 transition-colors">
                                    <KeyRound size={16} />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                                      <span className="truncate">{client.name}</span>
                                      {client.is_system && (
                                        <span className="text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 uppercase tracking-wider shrink-0 whitespace-nowrap">
                                          {t('clients.systemClient')}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {/* Platform */}
                              <td className="px-6 py-4 whitespace-nowrap">
                                {renderPlatformBadge(client.platform)}
                              </td>

                              {/* Client ID with quick copy */}
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-200/80 dark:border-slate-700"
                                >
                                  <code className="text-xs font-mono text-slate-700 dark:text-slate-200 font-medium">
                                    {client.client_id}
                                  </code>
                                  <button
                                    onClick={() => copyToClipboard(client.client_id, 'id', client.id)}
                                    className="p-0.5 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 rounded transition-colors cursor-pointer"
                                    title={t('clients.copyClientId')}
                                    aria-label={t('clients.copyClientId')}
                                  >
                                    {isIdCopied ? (
                                      <Check size={13} className="text-emerald-600 dark:text-emerald-400" />
                                    ) : (
                                      <Copy size={13} />
                                    )}
                                  </button>
                                </div>
                              </td>

                              {/* Status */}
                              <td className="px-6 py-4 whitespace-nowrap text-center">
                                <div className="flex justify-center">
                                  {client.is_active ? (
                                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-md border border-emerald-100 dark:border-emerald-800 whitespace-nowrap">
                                      <CheckCircle2 size={12} />
                                      {t('clients.active')}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2.5 py-1 rounded-md border border-rose-100 dark:border-rose-800 whitespace-nowrap">
                                      <Ban size={12} />
                                      {t('clients.deactivated')}
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Actions */}
                              <td className="px-6 py-4 whitespace-nowrap text-right">
                                <div
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1.5"
                                >
                                  {/* View Detail Button */}
                                  <button
                                    onClick={() => setDetailClient(client)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-orange-50 dark:hover:bg-orange-950/40 hover:text-orange-600 dark:hover:text-orange-400 rounded-lg transition-colors cursor-pointer"
                                    title={t('clients.viewDetails')}
                                  >
                                    <Eye size={13} />
                                    <span>{t('clients.viewDetails')}</span>
                                  </button>

                                  {/* Kill Switch Toggle */}
                                  <button
                                    onClick={() => handleToggleClick(client)}
                                    disabled={client.is_system}
                                    title={
                                      client.is_system
                                        ? t('clients.systemCannotLock')
                                        : client.is_active
                                        ? t('clients.deactivateAction')
                                        : t('clients.activateAction')
                                    }
                                    aria-label={
                                      client.is_active
                                        ? t('clients.deactivateAction')
                                        : t('clients.activateAction')
                                    }
                                    className={`p-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                                      client.is_active
                                        ? 'text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                                        : 'text-rose-500 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                                    }`}
                                  >
                                    {client.is_active ? <Ban size={15} /> : <CheckCircle2 size={15} />}
                                  </button>

                                  {/* Edit */}
                                  <button
                                    onClick={() => handleOpenEdit(client)}
                                    title={t('edit')}
                                    aria-label={t('edit')}
                                    className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                                  >
                                    <Edit2 size={15} />
                                  </button>

                                  {/* Delete */}
                                  <button
                                    onClick={() => setClientToDelete(client)}
                                    disabled={client.is_system}
                                    title={
                                      client.is_system
                                        ? t('clients.systemCannotDelete')
                                        : t('delete')
                                    }
                                    aria-label={t('delete')}
                                    className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                  >
                                    <Trash2 size={15} />
                                  </button>
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

      {/* Client Detail Modal */}
      {detailClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div
            className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
          >
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-4 bg-slate-50/50 dark:bg-slate-800/50">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
                  <KeyRound size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                      {detailClient.name}
                    </h3>
                    {detailClient.is_system && (
                      <span className="text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 uppercase tracking-wider">
                        {t('clients.systemClient')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {renderPlatformBadge(detailClient.platform)}
                    {detailClient.is_active ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-100 dark:border-emerald-800">
                        <CheckCircle2 size={11} />
                        {t('clients.active')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-md border border-rose-100 dark:border-rose-800">
                        <Ban size={11} />
                        {t('clients.deactivated')}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDetailClient(null)}
                className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                aria-label={t('clients.closeAria')}
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              {/* Credentials & API Key Section */}
              <div>
                <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2.5">
                  {t('clients.credentialsSection')}
                </h4>
                <div className="bg-slate-50/80 dark:bg-slate-800/80 rounded-2xl border border-slate-200/80 dark:border-slate-700 p-4 space-y-3.5">
                  {/* Client ID */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
                      {t('clients.clientId')}
                    </label>
                    <div className="flex items-center gap-2">
                      <code className="text-xs font-mono font-medium text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 px-3 py-2 rounded-xl border border-slate-200/80 dark:border-slate-700 flex-1 select-all break-all">
                        {detailClient.client_id}
                      </code>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(detailClient.client_id, 'id', detailClient.id)}
                        className="px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 rounded-xl shadow-2xs transition-colors cursor-pointer shrink-0 inline-flex items-center gap-1.5"
                        title={t('clients.copyClientId')}
                      >
                        {copiedClientId === detailClient.id ? (
                          <>
                            <Check size={13} className="text-emerald-600 dark:text-emerald-400" />
                            <span className="text-emerald-600 dark:text-emerald-400">{t('clients.copied')}</span>
                          </>
                        ) : (
                          <>
                            <Copy size={13} />
                            <span>{t('clients.copy')}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* API Key */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        {t('clients.apiKey')}
                      </label>
                      {!detailClient.is_system && (
                        <button
                          type="button"
                          onClick={() => setClientToRotate(detailClient)}
                          className="text-[11px] font-semibold text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 hover:underline cursor-pointer inline-flex items-center gap-1"
                        >
                          <RefreshCw size={11} />
                          {t('clients.rotateKey')}
                        </button>
                      )}
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <code className="text-xs font-mono font-medium text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 px-3 py-2 rounded-xl border border-slate-200/80 dark:border-slate-700 flex-1 break-all select-all">
                        {visibleKeys[detailClient.id]
                          ? detailClient.api_key
                          : `${detailClient.api_key.slice(0, 10)}••••••••••••••••••••••••`}
                      </code>
                      <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                        <button
                          type="button"
                          onClick={() => toggleKeyVisibility(detailClient.id)}
                          className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 rounded-xl transition-colors cursor-pointer shrink-0"
                          title={visibleKeys[detailClient.id] ? t('clients.hideKey') : t('clients.showKey')}
                        >
                          {visibleKeys[detailClient.id] ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(detailClient.api_key, 'key', detailClient.id)}
                          className="px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 rounded-xl shadow-2xs transition-colors cursor-pointer shrink-0 inline-flex items-center gap-1.5"
                          title={t('clients.copyApiKey')}
                        >
                          {copiedKeyId === detailClient.id ? (
                            <>
                              <Check size={13} className="text-emerald-600 dark:text-emerald-400" />
                              <span className="text-emerald-600 dark:text-emerald-400">{t('clients.copied')}</span>
                            </>
                          ) : (
                            <>
                              <Copy size={13} />
                              <span>{t('clients.copy')}</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">
                      {t('clients.headerUsage')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Governance & Specifications */}
              <div>
                <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2.5">
                  {t('clients.governanceSection')}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-slate-50/80 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700 p-3">
                    <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                      {t('clients.rateLimit')}
                    </span>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-1 block">
                      {detailClient.rate_limit_rps > 0
                        ? `${detailClient.rate_limit_rps} RPS`
                        : t('clients.rateLimitUnlimited')}
                    </span>
                  </div>

                  <div className="bg-slate-50/80 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700 p-3">
                    <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                      {t('clients.lastUsed')}
                    </span>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-1 block">
                      {formatLastUsed(detailClient.last_used_at)}
                    </span>
                  </div>

                  <div className="bg-slate-50/80 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700 p-3">
                    <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                      {t('clients.createdAt')}
                    </span>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-1 block">
                      {formatLastUsed(detailClient.created_at)}
                    </span>
                  </div>

                  <div className="bg-slate-50/80 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700 p-3">
                    <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                      {t('clients.accessType')}
                    </span>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-1 block">
                      {detailClient.client_type === 'confidential'
                        ? t('clients.confidentialClient')
                        : t('clients.publicClient')}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="px-5 sm:px-6 py-3.5 sm:py-4 bg-slate-50/80 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
              <div>
                {!detailClient.is_system && (
                  <button
                    type="button"
                    onClick={() => handleToggleClick(detailClient)}
                    className={`w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border transition-colors cursor-pointer ${
                      detailClient.is_active
                        ? 'border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 bg-rose-50/50 dark:bg-rose-950/40 hover:bg-rose-50 dark:hover:bg-rose-900/40'
                        : 'border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/40 hover:bg-emerald-50 dark:hover:bg-emerald-900/40'
                    }`}
                  >
                    {detailClient.is_active ? (
                      <>
                        <Ban size={13} />
                        <span>{t('clients.deactivateAction')}</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={13} />
                        <span>{t('clients.activateAction')}</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    const toEdit = detailClient;
                    setDetailClient(null);
                    handleOpenEdit(toEdit);
                  }}
                  className="flex-1 sm:flex-none justify-center px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Edit2 size={13} />
                  <span>{t('clients.editClient')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDetailClient(null)}
                  className="flex-1 sm:flex-none justify-center px-4 py-2 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
                >
                  {t('clients.close')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Client Modal */}
      {clientModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-800 dark:text-slate-100">
                {editingClient
                  ? t('clients.modalEditTitle')
                  : t('clients.modalCreateTitle')}
              </h3>
              <button
                type="button"
                onClick={() => setClientModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveClient} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  {t('clients.name')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={t('clients.namePlaceholder')}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  {t('clients.platform')} <span className="text-red-500">*</span>
                </label>
                <select
                  value={formPlatform}
                  onChange={(e) => setFormPlatform(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 cursor-pointer text-slate-900 dark:text-slate-100"
                >
                  <option value="mobile">{t('clients.platformMobile')}</option>
                  <option value="web_spa">{t('clients.platformWeb')}</option>
                  <option value="third_party">{t('clients.platformThirdParty')}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  {t('clients.rateLimit')}
                </label>
                <input
                  type="number"
                  min="0"
                  max="10000"
                  value={formRateLimit}
                  onChange={(e) => setFormRateLimit(Math.max(0, parseInt(e.target.value) || 0))}
                  placeholder="0"
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                  {t('clients.rateLimitHelper')}
                </p>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setClientModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {isSubmitting && (
                    <span className="w-3 h-3 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
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
