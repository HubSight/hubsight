import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from '../i18n';
import { api } from '../api/client';
import type {
  AppConfig,
  ApiClient,
  GoogleServiceAccount,
  FirebasePreflightResult,
  AppConfigQRResponse,
} from '@hubsight/sdk';
import {
  FileShield,
  Plus,
  Search,
  Download,
  QrCode,
  Eye,
  Trash2,
  Copy,
  Check,
  RotateCw,
  X,
  AlertCircle,
  CheckCircle2,
  Cloud,
  Shield,
  ArrowRight,
  ArrowLeft,
  Lock,
  Globe,
} from '@/components/icons';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import AppConfigQrModal from '../components/appconfig/AppConfigQrModal';

export const AppConfigs: React.FC = () => {
  const { t } = useTranslation();

  const [configs, setConfigs] = useState<AppConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Service accounts & clients for wizard
  const [serviceAccounts, setServiceAccounts] = useState<GoogleServiceAccount[]>([]);
  const [clients, setClients] = useState<ApiClient[]>([]);

  // Wizard state
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [isGenerating, setIsGenerating] = useState(false);

  // Wizard Form fields
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [autoCreateClient, setAutoCreateClient] = useState(true);
  const [selectedClientID, setSelectedClientID] = useState('');
  const [selectedSaID, setSelectedSaID] = useState('');
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightData, setPreflightData] = useState<FirebasePreflightResult | null>(null);

  const defaultGateway = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8088';
  const defaultHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const [gatewayUrl, setGatewayUrl] = useState(defaultGateway);
  const [apiUrl, setApiUrl] = useState(defaultGateway + '/api');
  const [webrtcUrl, setWebrtcUrl] = useState(`http://${defaultHost}:8555`);
  const [relayUrl, setRelayUrl] = useState(
    defaultGateway.replace(/^http/, 'ws') + '/relay'
  );

  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  // Result of generation
  const [generatedConfig, setGeneratedConfig] = useState<AppConfig | null>(null);

  // App API Gateway Kill-Switch State
  const [appApiEnabled, setAppApiEnabled] = useState<boolean>(true);
  const [isTogglingApi, setIsTogglingApi] = useState(false);

  // QR Modal
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [selectedConfigForQr, setSelectedConfigForQr] = useState<AppConfig | null>(null);
  const [qrData, setQrData] = useState<AppConfigQRResponse | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);

  // Detail Modal
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedConfigForDetail, setSelectedConfigForDetail] = useState<AppConfig | null>(null);

  // Delete Modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [configToDelete, setConfigToDelete] = useState<AppConfig | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Kill-Switch Modal
  const [killSwitchModalOpen, setKillSwitchModalOpen] = useState(false);

  // Load data
  const fetchData = async () => {
    setLoading(true);
    try {
      const [cfgList, saList, clientList, sysSettings] = await Promise.all([
        api.appConfigs.list(),
        api.googleServiceAccounts.list(),
        api.clients.list(),
        api.recorder.getSettings().catch(() => null),
      ]);
      setConfigs(cfgList || []);
      setServiceAccounts(saList || []);
      // Filter mobile or all clients
      setClients(clientList || []);
      if (sysSettings && typeof sysSettings.app_api_enabled === 'boolean') {
        setAppApiEnabled(sysSettings.app_api_enabled);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('appConfigs.loadError');
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAppApi = () => {
    setKillSwitchModalOpen(true);
  };

  const handleConfirmToggleAppApi = async () => {
    const nextState = !appApiEnabled;
    setIsTogglingApi(true);
    try {
      await api.recorder.updateSettings({ app_api_enabled: nextState });
      setAppApiEnabled(nextState);
      toast.success(
        nextState
          ? t('appConfigs.killSwitchEnabledSuccess')
          : t('appConfigs.killSwitchDisabledSuccess')
      );
      setKillSwitchModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('appConfigs.killSwitchUpdateError');
      toast.error(msg);
    } finally {
      setIsTogglingApi(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filtered configs
  const filteredConfigs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return configs;
    return configs.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.client_id.toLowerCase().includes(q) ||
        (c.project_id && c.project_id.toLowerCase().includes(q))
    );
  }, [configs, search]);

  // Statistics
  const totalProfiles = configs.length;
  const withFcmProfiles = configs.filter((c) => c.has_android_fcm || c.has_ios_fcm).length;
  const totalDownloads = configs.reduce((acc, c) => acc + (c.download_count || 0), 0);

  // Pre-flight check when Service Account is selected in Wizard
  const handleSelectServiceAccount = async (saId: string) => {
    setSelectedSaID(saId);
    if (!saId) {
      setPreflightData(null);
      return;
    }

    setPreflightLoading(true);
    try {
      const res = await api.appConfigs.preflightFirebase(saId);
      setPreflightData(res);
    } catch {
      setPreflightData(null);
    } finally {
      setPreflightLoading(false);
    }
  };

  // Reset wizard
  const resetWizard = () => {
    setWizardStep(1);
    setFormName('');
    setFormDesc('');
    setAutoCreateClient(true);
    setSelectedClientID('');
    setSelectedSaID('');
    setPreflightData(null);
    setPin('');
    setConfirmPin('');
    setGeneratedConfig(null);
    setIsGenerating(false);
  };

  const handleGatewayUrlChange = (newGw: string) => {
    setGatewayUrl(newGw);
    const clean = newGw.trim().replace(/\/+$/, '');
    if (!clean) return;

    // Unified API Base URL via Gateway
    setApiUrl(`${clean}/api`);

    // Unified Relay WebSocket URL via Gateway
    const wsProto = clean.startsWith('https') ? 'wss' : 'ws';
    const hostOnly = clean.replace(/^https?:\/\//, '');
    setRelayUrl(`${wsProto}://${hostOnly}/relay`);

    // WebRTC Base URL: Dedicated media streaming port 8555
    let hostWithoutPort = hostOnly;
    if (hostWithoutPort.includes(':')) {
      hostWithoutPort = hostWithoutPort.split(':')[0];
    }
    if (hostWithoutPort.includes('/')) {
      hostWithoutPort = hostWithoutPort.split('/')[0];
    }
    setWebrtcUrl(`http://${hostWithoutPort}:8555`);
  };

  const handleApplyGatewayPreset = (mode: 'prod' | 'local') => {
    if (mode === 'prod') {
      const domain =
        typeof window !== 'undefined' &&
        window.location.hostname !== 'localhost' &&
        window.location.hostname !== '127.0.0.1'
          ? window.location.origin
          : 'https://cctv.quoctran.space';
      handleGatewayUrlChange(domain);
    } else {
      handleGatewayUrlChange('http://localhost:8088');
    }
  };

  const openWizard = () => {
    resetWizard();
    const initialGw = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8088';
    handleGatewayUrlChange(initialGw);
    setIsWizardOpen(true);
  };

  // Submit Wizard
  const handleGenerate = async () => {
    if (!formName.trim()) {
      toast.error(t('appConfigs.nameRequiredError'));
      return;
    }
    if (pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      toast.error(t('appConfigs.pinLengthError'));
      return;
    }
    if (pin !== confirmPin) {
      toast.error(t('appConfigs.pinMismatchError'));
      return;
    }

    setIsGenerating(true);
    try {
      const res = await api.appConfigs.generate({
        name: formName.trim(),
        description: formDesc.trim(),
        pin: pin.trim(),
        google_service_account_id: selectedSaID || undefined,
        client_id: autoCreateClient ? undefined : selectedClientID || undefined,
        auto_create_client: autoCreateClient,
        client_name: `Client - ${formName.trim()}`,
        gateway_url: gatewayUrl.trim(),
        api_base_url: apiUrl.trim(),
        webrtc_base_url: webrtcUrl.trim(),
        relay_ws_url: relayUrl.trim(),
      });

      if (res.success && res.config) {
        setGeneratedConfig(res.config);
        setWizardStep(4);
        toast.success(res.message || t('appConfigs.generateSuccess'));
        fetchData();
      } else {
        toast.error(res.message || t('appConfigs.createFailed'));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('appConfigs.createFailedGeneric');
      toast.error(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  // Open QR modal
  const handleOpenQr = async (config: AppConfig) => {
    setSelectedConfigForQr(config);
    setQrModalOpen(true);
    setLoadingQr(true);
    try {
      const res = await api.appConfigs.getQr(config.id);
      setQrData(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('appConfigs.qrFailed');
      toast.error(msg);
    } finally {
      setLoadingQr(false);
    }
  };

  // Trigger Download
  const handleDownload = (config: AppConfig) => {
    const url = api.appConfigs.getDownloadUrl(config.id);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `hubsight_${config.name}.hscfg`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    toast.success(t('appConfigs.downloadingToast'));
    setTimeout(fetchData, 1500);
  };

  // Delete
  const handleDelete = async () => {
    if (!configToDelete) return;
    setIsDeleting(true);
    try {
      await api.appConfigs.delete(configToDelete.id);
      toast.success(t('appConfigs.deleteSuccess'));
      setDeleteModalOpen(false);
      setConfigToDelete(null);
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('appConfigs.deleteFailed');
      toast.error(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  const copyText = (txt: string) => {
    navigator.clipboard.writeText(txt);
    toast.success(t('serviceAccounts.copied'));
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50/50 dark:bg-slate-950/50 overflow-hidden">
      {/* Top Header */}
      <div className="shrink-0 w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-800 shadow-2xs px-4 sm:px-6 lg:px-8 py-3.5 sm:py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-orange-600 flex items-center justify-center text-white shadow-xs shrink-0">
              <FileShield size={18} />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-lg lg:text-xl font-bold text-slate-800 dark:text-slate-100 leading-snug">
                {t('appConfigs.title')}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 hidden sm:block font-medium">
                {t('appConfigs.subtitle')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={openWizard}
              className="px-3 py-2 sm:px-4 sm:py-2.5 bg-orange-600 hover:bg-orange-700 active:scale-98 text-white text-xs font-semibold rounded-xl shadow-xs transition-all flex items-center gap-1.5 sm:gap-2 cursor-pointer whitespace-nowrap"
            >
              <Plus size={15} />
              <span className="hidden sm:inline">{t('appConfigs.createProfile')}</span>
              <span className="sm:hidden">{t('appConfigs.createShort')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Scrollable Content */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6 pb-20">
        {/* App API Gateway Kill-Switch Master Control */}
        <div className={`p-3.5 sm:p-4 rounded-2xl border transition-all shadow-xs flex items-center justify-between gap-4 ${
          appApiEnabled
            ? 'bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border-emerald-500/30 dark:border-emerald-500/20'
            : 'bg-gradient-to-r from-rose-500/10 via-rose-500/5 to-transparent border-rose-500/30 dark:border-rose-500/20'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-xs ${
              appApiEnabled
                ? 'bg-emerald-500 text-white'
                : 'bg-rose-500 text-white'
            }`}>
              <Shield size={20} />
            </div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100">
                {t('appConfigs.killSwitchTitle')}
              </h2>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-bold tracking-wide ${
                appApiEnabled
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                  : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-800 animate-pulse'
              }`}>
                <span className={`w-2 h-2 rounded-full ${appApiEnabled ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                {appApiEnabled ? t('appConfigs.killSwitchActive') : t('appConfigs.killSwitchPaused')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              disabled={isTogglingApi}
              onClick={handleToggleAppApi}
              className={`px-3.5 py-2 sm:px-4 sm:py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-2 shadow-xs cursor-pointer ${
                appApiEnabled
                  ? 'bg-rose-600 hover:bg-rose-700 active:scale-95 text-white shadow-rose-600/20'
                  : 'bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white shadow-emerald-600/20'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isTogglingApi ? (
                <>
                  <RotateCw size={14} className="animate-spin" />
                  <span>{t('appConfigs.killSwitchProcessing')}</span>
                </>
              ) : appApiEnabled ? (
                <>
                  <Lock size={14} />
                  <span>{t('appConfigs.killSwitchDisableBtn')}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} />
                  <span>{t('appConfigs.killSwitchEnableBtn')}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* KPI Stats Widgets */}
        <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 border border-slate-200/80 dark:border-slate-800 shadow-2xs flex flex-col sm:flex-row items-center sm:items-center gap-2 sm:gap-4 text-center sm:text-left">
            <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 flex items-center justify-center shadow-2xs shrink-0">
              <FileShield size={18} className="sm:hidden" />
              <FileShield size={22} className="hidden sm:block" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 truncate block">{t('appConfigs.totalProfiles')}</span>
              <p className="text-base sm:text-2xl font-bold text-slate-800 dark:text-slate-100 leading-tight mt-0.5 sm:mt-1">{totalProfiles}</p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 border border-slate-200/80 dark:border-slate-800 shadow-2xs flex flex-col sm:flex-row items-center sm:items-center gap-2 sm:gap-4 text-center sm:text-left">
            <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-2xs shrink-0">
              <Cloud size={18} className="sm:hidden" />
              <Cloud size={22} className="hidden sm:block" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 truncate block">{t('appConfigs.withFcm')}</span>
              <p className="text-base sm:text-2xl font-bold text-slate-800 dark:text-slate-100 leading-tight mt-0.5 sm:mt-1">{withFcmProfiles}</p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 border border-slate-200/80 dark:border-slate-800 shadow-2xs flex flex-col sm:flex-row items-center sm:items-center gap-2 sm:gap-4 text-center sm:text-left">
            <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 flex items-center justify-center shadow-2xs shrink-0">
              <Download size={18} className="sm:hidden" />
              <Download size={22} className="hidden sm:block" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 truncate block">{t('appConfigs.totalDownloads')}</span>
              <p className="text-base sm:text-2xl font-bold text-slate-800 dark:text-slate-100 leading-tight mt-0.5 sm:mt-1">{totalDownloads}</p>
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 bg-white dark:bg-slate-900 p-2.5 sm:p-3 rounded-xl sm:rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
          <div className="relative flex-1 sm:max-w-md">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('appConfigs.searchPlaceholder')}
              className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
          </div>

          <span className="text-[11px] sm:text-xs text-slate-400 dark:text-slate-500 font-medium text-right sm:text-left whitespace-nowrap px-1">
            {t('appConfigs.showingCount', { count: filteredConfigs.length })}
          </span>
        </div>


        {/* Desktop Table View */}
        <div className="hidden md:block bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-800/75 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">
                  <th className="py-3.5 px-5 min-w-[240px]">{t('appConfigs.profileName')}</th>
                  <th className="py-3.5 px-5 min-w-[220px]">{t('appConfigs.linkedClient')}</th>
                  <th className="py-3.5 px-5 min-w-[160px]">{t('appConfigs.gcpProject')}</th>
                  <th className="py-3.5 px-5 min-w-[150px]">{t('appConfigs.createdAt')}</th>
                  <th className="py-3.5 px-5 min-w-[150px] text-right">{t('appConfigs.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400 dark:text-slate-500 font-medium">
                      <div className="flex items-center justify-center gap-2">
                        <RotateCw size={16} className="animate-spin text-orange-600 dark:text-orange-400" />
                        <span>{t('loading')}</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredConfigs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400 dark:text-slate-500 font-medium">
                      {t('appConfigs.empty')}
                    </td>
                  </tr>
                ) : (
                  filteredConfigs.map((cfg) => (
                    <tr key={cfg.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/50 transition-colors group">
                      {/* Name & FCM badges */}
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
                            <FileShield size={15} />
                          </div>
                          <div className="min-w-0 flex flex-col gap-1">
                            <span className="font-bold text-slate-800 dark:text-slate-100 text-xs whitespace-nowrap">{cfg.name}</span>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {cfg.has_android_fcm && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800 shrink-0 whitespace-nowrap">
                                  <Check size={10} /> Android FCM
                                </span>
                              )}
                              {cfg.has_ios_fcm && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/50 px-1.5 py-0.5 rounded-md border border-sky-200 dark:border-sky-800 shrink-0 whitespace-nowrap">
                                  <Check size={10} /> iOS FCM
                                </span>
                              )}
                              {!cfg.has_android_fcm && !cfg.has_ios_fcm && (
                                <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0 whitespace-nowrap">{t('appConfigs.noFcm')}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Client info */}
                      <td className="py-3.5 px-5 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[180px]" title={cfg.client?.name || 'Client App'}>
                            {cfg.client?.name || 'Client App'}
                          </span>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <code className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[11px] font-mono text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700 shrink-0">
                              {cfg.client_id}
                            </code>
                            <button
                              type="button"
                              onClick={() => copyText(cfg.client_id)}
                              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer shrink-0"
                              title={t('appConfigs.copyClientId')}
                            >
                              <Copy size={11} />
                            </button>
                          </div>
                        </div>
                      </td>

                      {/* GCP Project */}
                      <td className="py-3.5 px-5 whitespace-nowrap">
                        {cfg.project_id ? (
                          <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-mono shrink-0 whitespace-nowrap">
                            <Cloud size={12} className="text-orange-600 dark:text-orange-400 shrink-0" />
                            <span>{cfg.project_id}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500 text-xs">—</span>
                        )}
                      </td>

                      {/* Date & Downloads */}
                      <td className="py-3.5 px-5 whitespace-nowrap">
                        <div className="text-slate-700 dark:text-slate-200 font-medium">
                          {dayjs(cfg.created_at).format('DD/MM/YYYY HH:mm')}
                        </div>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500">
                          {t('appConfigs.downloadCount', { count: cfg.download_count })}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleDownload(cfg)}
                            className="p-1.5 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/40 rounded-lg transition-colors cursor-pointer shrink-0"
                            title={t('appConfigs.downloadAction')}
                          >
                            <Download size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenQr(cfg)}
                            className="p-1.5 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40 rounded-lg transition-colors cursor-pointer shrink-0"
                            title={t('appConfigs.qrAction')}
                          >
                            <QrCode size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedConfigForDetail(cfg);
                              setDetailModalOpen(true);
                            }}
                            className="p-1.5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer shrink-0"
                            title={t('appConfigs.detailAction')}
                          >
                            <Eye size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setConfigToDelete(cfg);
                              setDeleteModalOpen(true);
                            }}
                            className="p-1.5 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors cursor-pointer shrink-0"
                            title={t('appConfigs.deleteAction')}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile Cards View */}
        <div className="block md:hidden space-y-3">
          {loading ? (
            <div className="p-8 text-center text-slate-400 dark:text-slate-500">
              <RotateCw size={24} className="animate-spin text-orange-600 dark:text-orange-400 mx-auto mb-2" />
              <span>{t('loading')}</span>
            </div>
          ) : filteredConfigs.length === 0 ? (
            <div className="p-8 text-center text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
              {t('appConfigs.empty')}
            </div>
          ) : (
            filteredConfigs.map((cfg) => (
              <div
                key={cfg.id}
                className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col gap-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
                      <FileShield size={16} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">{cfg.name}</h4>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500">
                        {dayjs(cfg.created_at).format('DD/MM/YYYY HH:mm')} • {t('appConfigs.downloadCount', { count: cfg.download_count })}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {cfg.has_android_fcm && (
                    <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                      Android FCM
                    </span>
                  )}
                  {cfg.has_ios_fcm && (
                    <span className="text-[10px] font-semibold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/50 px-2 py-0.5 rounded-md border border-sky-200 dark:border-sky-800">
                      iOS FCM
                    </span>
                  )}
                  {cfg.project_id && (
                    <span className="text-[10px] font-mono text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700">
                      GCP: {cfg.project_id}
                    </span>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleDownload(cfg)}
                    className="flex-1 px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white font-semibold text-xs rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
                  >
                    <Download size={13} />
                    <span>{t('appConfigs.downloadFile')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenQr(cfg)}
                    className="px-2.5 py-2 bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 dark:hover:bg-sky-900/50 text-sky-700 dark:text-sky-300 font-semibold text-xs rounded-xl transition-colors cursor-pointer flex items-center gap-1 border border-sky-200 dark:border-sky-800 shrink-0"
                    title={t('appConfigs.viewQr')}
                  >
                    <QrCode size={13} />
                    <span className="hidden xs:inline">{t('appConfigs.viewQr')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedConfigForDetail(cfg);
                      setDetailModalOpen(true);
                    }}
                    className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer shrink-0"
                    title={t('appConfigs.detailAction')}
                  >
                    <Eye size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfigToDelete(cfg);
                      setDeleteModalOpen(true);
                    }}
                    className="p-2 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-colors cursor-pointer shrink-0"
                    title={t('appConfigs.deleteAction')}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>


      {/* QR Modal */}
      <AppConfigQrModal
        isOpen={qrModalOpen}
        onClose={() => setQrModalOpen(false)}
        config={selectedConfigForQr}
        qrData={qrData}
        loading={loadingQr}
        onRefreshQr={() => selectedConfigForQr && handleOpenQr(selectedConfigForQr)}
      />

      {/* 4-Step Wizard Modal */}
      {isWizardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col gap-5 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 flex items-center justify-center shadow-2xs">
                  <FileShield size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 leading-tight">
                    {t('appConfigs.wizardTitle')}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {t('appConfigs.wizardSubtitle')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsWizardOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Step Indicator */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { step: 1, label: t('appConfigs.step1') },
                { step: 2, label: t('appConfigs.step2') },
                { step: 3, label: t('appConfigs.step3') },
                { step: 4, label: t('appConfigs.step4') },
              ].map((s) => (
                <div
                  key={s.step}
                  className={`p-2 rounded-xl border text-center transition-all ${
                    wizardStep === s.step
                      ? 'bg-orange-50 dark:bg-orange-950/50 border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-300 font-bold'
                      : wizardStep > s.step
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-medium'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-400 dark:text-slate-500 font-medium'
                  }`}
                >
                  <span className="text-[11px] block truncate">{s.label}</span>
                </div>
              ))}
            </div>

            {/* Step 1: Basic Profile & Client */}
            {wizardStep === 1 && (
              <div className="space-y-4 py-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    {t('appConfigs.profileNameLabel')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder={t('appConfigs.namePlaceholder')}
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    {t('appConfigs.descLabel')}
                  </label>
                  <textarea
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    rows={2}
                    placeholder={t('appConfigs.descPlaceholder')}
                    className="w-full px-3.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 resize-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
                  />
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100">{t('appConfigs.autoCreateClient')}</span>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('appConfigs.autoCreateClientHint')}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={autoCreateClient}
                      onChange={(e) => setAutoCreateClient(e.target.checked)}
                      className="w-4 h-4 text-orange-600 rounded border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 focus:ring-orange-500 cursor-pointer"
                    />
                  </div>

                  {!autoCreateClient && (
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                        {t('appConfigs.selectExistingClient')}
                      </label>
                      <select
                        value={selectedClientID}
                        onChange={(e) => setSelectedClientID(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                      >
                        <option value="">{t('appConfigs.selectClientPlaceholder')}</option>
                        {clients.map((cl) => (
                          <option key={cl.client_id} value={cl.client_id}>
                            {cl.name} ({cl.client_id})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 2: Google FCM & Pre-flight check */}
            {wizardStep === 2 && (
              <div className="space-y-4 py-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    {t('appConfigs.selectSaHint')}
                  </label>
                  <select
                    value={selectedSaID}
                    onChange={(e) => handleSelectServiceAccount(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  >
                    <option value="">{t('appConfigs.noFcmOption')}</option>
                    {serviceAccounts.map((sa) => (
                      <option key={sa.id} value={sa.id}>
                        {sa.client_email.includes('firebase-adminsdk') ? '🔥 [Firebase Console] ' : ''}
                        {sa.name} ({sa.project_id}) {sa.is_active ? t('appConfigs.saActiveBadge') : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                    {t('appConfigs.saFirebaseApiHint')}
                  </p>
                </div>

                {/* Pre-flight discovery card */}
                {selectedSaID && (
                  <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                        <Cloud size={14} className="text-orange-600 dark:text-orange-400" />
                        {t('appConfigs.firebaseAppsStatus')}
                      </span>
                      {preflightLoading && <RotateCw size={13} className="animate-spin text-orange-600 dark:text-orange-400" />}
                    </div>

                    {preflightLoading ? (
                      <div className="py-4 text-center text-xs text-slate-400 dark:text-slate-500">
                        {t('appConfigs.firebaseConnecting')}
                      </div>
                    ) : preflightData ? (
                      <div className="space-y-2.5 text-xs">
                        {preflightData.error && (
                          <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs">
                            <p className="font-bold flex items-center gap-1.5"><AlertCircle size={13} /> {preflightData.error}</p>
                            <p className="text-[11px] mt-1 text-rose-600 dark:text-rose-400">
                              {t('appConfigs.firebaseTip')}
                            </p>
                          </div>
                        )}

                        {/* Android Apps */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-700">
                          <span className="font-semibold text-slate-700 dark:text-slate-200">{t('appConfigs.androidConfigLabel')}</span>
                          {preflightData.android_apps && preflightData.android_apps.length > 0 ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800 shrink-0 whitespace-nowrap self-start sm:self-auto">
                              <Check size={11} /> {preflightData.android_apps[0].packageName || t('appConfigs.appFound')}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800 shrink-0 whitespace-nowrap self-start sm:self-auto">
                              <AlertCircle size={11} /> {t('appConfigs.noAndroidApp')}
                            </span>
                          )}
                        </div>

                        {/* iOS Apps */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-700">
                          <span className="font-semibold text-slate-700 dark:text-slate-200">{t('appConfigs.iosConfigLabel')}</span>
                          {preflightData.ios_apps && preflightData.ios_apps.length > 0 ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/50 px-2 py-0.5 rounded-md border border-sky-200 dark:border-sky-800 shrink-0 whitespace-nowrap self-start sm:self-auto">
                              <Check size={11} /> {preflightData.ios_apps[0].bundleId || t('appConfigs.appFound')}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800 shrink-0 whitespace-nowrap self-start sm:self-auto">
                              <AlertCircle size={11} /> {t('appConfigs.noIosApp')}
                            </span>
                          )}
                        </div>

                        {((!preflightData.android_apps || preflightData.android_apps.length === 0) ||
                          (!preflightData.ios_apps || preflightData.ios_apps.length === 0)) && (
                          <div className="text-[11px] text-slate-500 dark:text-amber-200/80 bg-amber-50/60 dark:bg-amber-950/30 p-2.5 rounded-xl border border-amber-200/70 dark:border-amber-800/50">
                            💡 {t('appConfigs.firebaseAppHint')}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 p-2.5 rounded-xl border border-amber-200 dark:border-amber-800">
                        {t('appConfigs.firebaseConnectError')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Step 3: URLs & PIN */}
            {wizardStep === 3 && (
              <div className="space-y-4 py-2">
                {/* Deployment Architecture Callout */}
                <div className="p-3.5 rounded-2xl bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-800/50 text-xs text-blue-950 dark:text-blue-200 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-blue-900 dark:text-blue-300">
                    <Globe size={14} className="text-blue-600 dark:text-blue-400 shrink-0" />
                    <span>{t('appConfigs.networkArchTitle')}</span>
                  </div>
                  <p className="text-[11px] text-blue-900/90 dark:text-blue-200/90 leading-relaxed">
                    {t('appConfigs.networkArchDesc')}
                    <br />
                    {t('appConfigs.networkArchWebrtc')}
                  </p>
                </div>

                {/* Master Gateway Domain URL */}
                <div className="space-y-1.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                      Domain / API Gateway URL (Nginx Reverse Proxy) <span className="text-red-500">*</span>
                    </label>
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleApplyGatewayPreset('prod')}
                        className="px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors cursor-pointer shrink-0 whitespace-nowrap"
                      >
                        🌐 Production Domain
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApplyGatewayPreset('local')}
                        className="px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors cursor-pointer shrink-0 whitespace-nowrap"
                      >
                        💻 Local Dev (:8088)
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={gatewayUrl}
                    onChange={(e) => handleGatewayUrlChange(e.target.value)}
                    placeholder={t('appConfigs.gatewayPlaceholder')}
                    className="w-full px-3.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-mono"
                  />
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    {t('appConfigs.domainSyncHint')}
                  </p>
                </div>

                {/* Derived URLs Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">API Base URL</label>
                      <span className="text-[10px] text-emerald-700 dark:text-emerald-300 font-semibold bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.2 rounded border border-emerald-200 dark:border-emerald-800">
                        Unified Gateway
                      </span>
                    </div>
                    <input
                      type="text"
                      value={apiUrl}
                      onChange={(e) => setApiUrl(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">WebRTC Base URL</label>
                      <span className="text-[10px] text-amber-700 dark:text-amber-300 font-semibold bg-amber-50 dark:bg-amber-950/50 px-1.5 py-0.2 rounded border border-amber-200 dark:border-amber-800">
                        Port :8555 Media
                      </span>
                    </div>
                    <input
                      type="text"
                      value={webrtcUrl}
                      onChange={(e) => setWebrtcUrl(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Relay WebSocket URL</label>
                      <span className="text-[10px] text-emerald-700 dark:text-emerald-300 font-semibold bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.2 rounded border border-emerald-200 dark:border-emerald-800">
                        Unified Gateway
                      </span>
                    </div>
                    <input
                      type="text"
                      value={relayUrl}
                      onChange={(e) => setRelayUrl(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-slate-800 dark:text-slate-100"
                    />
                  </div>
                </div>

                {/* 6-Digit PIN Box */}
                <div className="bg-orange-50/60 dark:bg-orange-950/30 p-4 rounded-2xl border border-orange-200/80 dark:border-orange-900/40 space-y-3">
                  <div className="flex items-center gap-2">
                    <Lock size={15} className="text-orange-600 dark:text-orange-400 shrink-0" />
                    <span className="text-xs font-bold text-orange-950 dark:text-orange-200">
                      {t('appConfigs.pinStepTitle')} <span className="text-red-500">*</span>
                    </span>
                  </div>
                  <p className="text-[11px] text-orange-900/80 dark:text-orange-200/80">
                    {t('appConfigs.pinStepDesc')}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">{t('appConfigs.pinLabel')}</label>
                      <input
                        type="password"
                        maxLength={6}
                        value={pin}
                        onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                        placeholder="••••••"
                        className="w-full px-3.5 py-2.5 text-center tracking-widest text-base font-mono bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">{t('appConfigs.confirmPinLabel')}</label>
                      <input
                        type="password"
                        maxLength={6}
                        value={confirmPin}
                        onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                        placeholder="••••••"
                        className="w-full px-3.5 py-2.5 text-center tracking-widest text-base font-mono bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Complete & Success */}
            {wizardStep === 4 && generatedConfig && (
              <div className="py-6 flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-16 h-16 rounded-3xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-sm shrink-0">
                  <CheckCircle2 size={36} />
                </div>

                <div>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                    {t('appConfigs.successTitle')}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1">
                    {t('appConfigs.successSubtitle')}
                  </p>
                </div>

                <div className="w-full bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-3.5 border border-slate-200 dark:border-slate-700 text-left text-xs space-y-1.5 font-mono">
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">{t('appConfigs.fileName')}</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">hubsight_{generatedConfig.name}.hscfg</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">{t('appConfigs.fileSize')}</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{(generatedConfig.file_size / 1024).toFixed(1)} KB</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">SHA256:</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[220px]" title={generatedConfig.sha256_checksum}>
                      {generatedConfig.sha256_checksum}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3 w-full pt-2">
                  <button
                    type="button"
                    onClick={() => handleDownload(generatedConfig)}
                    className="w-full sm:flex-1 px-4 py-3 bg-orange-600 hover:bg-orange-700 text-white font-semibold text-xs rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs shrink-0 whitespace-nowrap"
                  >
                    <Download size={16} className="shrink-0" />
                    <span>{t('appConfigs.downloadNow')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsWizardOpen(false);
                      handleOpenQr(generatedConfig);
                    }}
                    className="w-full sm:w-auto px-4 py-3 bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 dark:hover:bg-sky-900/50 text-sky-700 dark:text-sky-300 font-semibold text-xs rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 border border-sky-200 dark:border-sky-800 shrink-0 whitespace-nowrap"
                  >
                    <QrCode size={16} className="shrink-0" />
                    <span>{t('appConfigs.viewQr')}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Navigation buttons */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
              {wizardStep > 1 && wizardStep < 4 ? (
                <button
                  type="button"
                  onClick={() => setWizardStep((s) => (s - 1) as 1 | 2 | 3)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                >
                  <ArrowLeft size={13} className="shrink-0" />
                  <span>{t('appConfigs.btnBack')}</span>
                </button>
              ) : (
                <div />
              )}

              {wizardStep < 3 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (wizardStep === 1 && !formName.trim()) {
                      toast.error(t('appConfigs.nameRequiredError'));
                      return;
                    }
                    setWizardStep((s) => (s + 1) as 2 | 3);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs shrink-0 whitespace-nowrap"
                >
                  <span>{t('appConfigs.btnNext')}</span>
                  <ArrowRight size={13} className="shrink-0" />
                </button>
              ) : wizardStep === 3 ? (
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="px-5 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs disabled:opacity-50 shrink-0 whitespace-nowrap"
                >
                  {isGenerating ? <RotateCw size={13} className="animate-spin shrink-0" /> : <Shield size={13} className="shrink-0" />}
                  <span>{isGenerating ? t('appConfigs.btnEncrypting') : t('appConfigs.btnCreateEncrypt')}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsWizardOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer shrink-0 whitespace-nowrap"
                >
                  {t('appConfigs.close')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailModalOpen && selectedConfigForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col gap-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 flex items-center justify-center shadow-2xs shrink-0">
                  <FileShield size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 leading-tight">
                    {t('appConfigs.detailTitle')}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
                    {selectedConfigForDetail.id}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700 space-y-1.5">
                <span className="font-bold text-slate-700 dark:text-slate-200 block">{t('appConfigs.networkSection')}</span>
                <div className="font-mono text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
                  <div>API: {selectedConfigForDetail.api_base_url}</div>
                  <div>WebRTC: {selectedConfigForDetail.webrtc_base_url}</div>
                  <div>Relay WS: {selectedConfigForDetail.relay_ws_url}</div>
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700 space-y-1.5">
                <span className="font-bold text-slate-700 dark:text-slate-200 block">{t('appConfigs.securitySection')}</span>
                <div className="font-mono text-[11px] text-slate-600 dark:text-slate-300 space-y-1 break-all">
                  <div>{t('appConfigs.fileSizeVal', { size: (selectedConfigForDetail.file_size / 1024).toFixed(1) })}</div>
                  <div>{t('appConfigs.storedFile', { key: selectedConfigForDetail.object_key })}</div>
                  <div>SHA256: {selectedConfigForDetail.sha256_checksum}</div>
                  <div>{t('appConfigs.algorithm')}</div>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setDetailModalOpen(false);
                  handleDownload(selectedConfigForDetail);
                }}
                className="w-full sm:w-auto px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-semibold text-xs rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap"
              >
                <Download size={13} className="shrink-0" />
                <span>{t('appConfigs.downloadFile')}</span>
              </button>
              <button
                type="button"
                onClick={() => setDetailModalOpen(false)}
                className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer shrink-0 whitespace-nowrap"
              >
                {t('appConfigs.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Kill-Switch Toggle Confirmation Modal */}
      {killSwitchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col gap-4">
            <div className="flex items-center gap-3.5">
              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                appApiEnabled
                  ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400'
                  : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
              }`}>
                {appApiEnabled ? <AlertCircle size={22} /> : <CheckCircle2 size={22} />}
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 leading-tight">
                  {appApiEnabled
                    ? t('appConfigs.killSwitchModalTitleDisable')
                    : t('appConfigs.killSwitchModalTitleEnable')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {t('appConfigs.killSwitchTitle')}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {appApiEnabled
                ? t('appConfigs.killSwitchConfirmDisable')
                : t('appConfigs.killSwitchConfirmEnable')}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                disabled={isTogglingApi}
                onClick={() => setKillSwitchModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer shrink-0 whitespace-nowrap disabled:opacity-50"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmToggleAppApi}
                disabled={isTogglingApi}
                className={`px-4 py-2 text-xs font-semibold text-white rounded-xl transition-colors cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                  appApiEnabled
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {isTogglingApi && <RotateCw size={13} className="animate-spin shrink-0" />}
                <span>
                  {appApiEnabled
                    ? t('appConfigs.killSwitchDisableBtn')
                    : t('appConfigs.killSwitchEnableBtn')}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && configToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col gap-4">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
              <div className="w-10 h-10 rounded-2xl bg-red-50 dark:bg-red-950/40 flex items-center justify-center shrink-0">
                <AlertCircle size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  {t('appConfigs.deleteConfirmTitle')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                  {configToDelete.name}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {t('appConfigs.deleteConfirmMsg')}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer shrink-0 whitespace-nowrap"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-1.5 shrink-0 whitespace-nowrap"
              >
                {isDeleting && <RotateCw size={13} className="animate-spin shrink-0" />}
                <span>{t('delete')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const MobileConfigs = AppConfigs;
export default AppConfigs;
