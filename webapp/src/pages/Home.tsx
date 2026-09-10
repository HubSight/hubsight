import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera,
  HardDrive,
  Users,
  Layers,
  Activity,
  Cpu,
  Server,
  RefreshCw,
  Video,
  AlertTriangle,
  ShieldCheck,
  HeartHandshake,
  Plus,
  FileShield,
  ChevronRight,
  Clock,
  Radio,
  Tv,
  Sparkles,
  Gauge,
  Sliders,
  UserCog,
} from '@/components/icons';
import { api } from '../api/client';
import type { CameraType, PoolStatusSummary, NvrStatusResponse, NotificationItem } from '@hubsight/sdk';
import {
  useOnNotification,
  useOnPoolStatus,
  useOnNvrStatus,
  useOnCameraStarted,
  useOnCameraStopped,
} from '@hubsight/sdk/react';
import { useTranslation } from '../i18n';
import { useTimezone } from '../context/TimezoneContext';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

const formatUptime = (seconds: number) => {
  if (!seconds) return '0m';
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || parts.length === 0) parts.push(`${m}m`);
  return parts.join(' ');
};

export const Home: React.FC = () => {
  const { t } = useTranslation();
  const { formatNotificationBody } = useTimezone();
  const navigate = useNavigate();

  const [cameras, setCameras] = useState<CameraType[]>([]);
  const [poolStatus, setPoolStatus] = useState<PoolStatusSummary | null>(null);
  const [nvrStatus, setNvrStatus] = useState<NvrStatusResponse | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentTime, setCurrentTime] = useState<string>(dayjs().format('HH:mm:ss'));

  // Update digital clock every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(dayjs().format('HH:mm:ss'));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch all primary operational telemetry
  const fetchDashboardData = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    try {
      const [camsRes, poolRes, nvrRes, notifsRes] = await Promise.allSettled([
        api.cameras.list(),
        api.pool.status(),
        api.recorder.status(),
        api.notifications.list(),
      ]);

      if (camsRes.status === 'fulfilled') setCameras(camsRes.value);
      if (poolRes.status === 'fulfilled') setPoolStatus(poolRes.value);
      if (nvrRes.status === 'fulfilled') setNvrStatus(nvrRes.value);
      if (notifsRes.status === 'fulfilled') setNotifications(notifsRes.value.notifications || []);
    } catch (err) {
      console.error('Failed to refresh dashboard telemetry:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData(false);
  }, [fetchDashboardData]);

  // Real-time Event Subscriptions (WebSockets via Relay)
  useOnNotification((newNotif: unknown) => {
    if (newNotif && typeof newNotif === 'object') {
      const n = newNotif as NotificationItem;
      setNotifications((prev) => [n, ...prev.slice(0, 9)]);
    }
  });

  useOnPoolStatus((raw: unknown) => {
    if (raw && typeof raw === 'object') {
      const root = raw as Record<string, unknown>;
      const inner =
        Array.isArray(root.cameras) || typeof root.total_cameras === 'number'
          ? root
          : root.data && typeof root.data === 'object'
            ? (root.data as Record<string, unknown>)
            : null;
      if (inner && (inner.cameras === undefined || Array.isArray(inner.cameras))) {
        setPoolStatus(inner as unknown as PoolStatusSummary);
      }
    }
  });

  useOnNvrStatus((raw: unknown) => {
    if (raw && typeof raw === 'object') {
      const root = raw as Record<string, unknown>;
      const inner =
        root.storage || root.system
          ? root
          : root.data && typeof root.data === 'object'
            ? (root.data as Record<string, unknown>)
            : null;
      if (inner) {
        setNvrStatus(inner as unknown as NvrStatusResponse);
      }
    }
  });

  useOnCameraStarted(() => fetchDashboardData(true));
  useOnCameraStopped(() => fetchDashboardData(true));

  // ── Metrics Calculation ───────────────────────────────────────────────────
  const totalCameras = cameras.length;
  const onlineCameras = useMemo(
    () => cameras.filter((c) => c.is_active && !c.is_stopped).length,
    [cameras]
  );
  const aiCameras = useMemo(
    () => cameras.filter((c) => c.enable_ai).length,
    [cameras]
  );
  const nvrCameras = useMemo(
    () => cameras.filter((c) => c.nvr_mode && c.nvr_mode !== 'disabled').length,
    [cameras]
  );

  const storageQuotaGb = useMemo(() => {
    if (!nvrStatus?.storage?.quota_bytes) return 0;
    return Math.round(nvrStatus.storage.quota_bytes / (1024 * 1024 * 1024));
  }, [nvrStatus]);

  const storageUsedGb = useMemo(() => {
    if (!nvrStatus?.storage?.used_bytes) return '0.0';
    return (nvrStatus.storage.used_bytes / (1024 * 1024 * 1024)).toFixed(1);
  }, [nvrStatus]);

  const storageFreeGb = useMemo(() => {
    if (!nvrStatus?.storage?.free_bytes) return '0.0';
    return (nvrStatus.storage.free_bytes / (1024 * 1024 * 1024)).toFixed(1);
  }, [nvrStatus]);

  const storageUsedPercent = useMemo(() => {
    if (!nvrStatus?.storage?.used_percentage) return 0;
    return Math.min(100, Math.round(nvrStatus.storage.used_percentage));
  }, [nvrStatus]);

  const retentionDays = nvrStatus?.storage?.retention_days || 14;

  const activeViewers = poolStatus?.total_active_viewers ?? 0;
  const liveStreams = poolStatus?.total_live_streams ?? 0;
  const cvStreams = poolStatus?.total_cv_streams ?? 0;

  const strangerAlertsCount = useMemo(
    () => notifications.filter((n) => n.category === 'stranger').length,
    [notifications]
  );
  const familyGuestsCount = useMemo(
    () =>
      notifications.filter(
        (n) =>
          n.category === 'family' ||
          n.category === 'member' ||
          n.category === 'guest'
      ).length,
    [notifications]
  );

  // Map camera pool viewers lookup
  const cameraViewersMap = useMemo(() => {
    const map = new Map<string, number>();
    if (poolStatus?.cameras) {
      for (const poolCam of poolStatus.cameras) {
        if (poolCam.camera_id) {
          const liveConns = Object.values(poolCam.live_pool || {});
          const totalUsers = liveConns.reduce((sum, conn) => sum + (conn.active_users || 0), 0);
          map.set(poolCam.camera_id, totalUsers);
        }
      }
    }
    return map;
  }, [poolStatus]);

  // Map camera nvr status lookup
  const cameraNvrMap = useMemo(() => {
    const map = new Map<string, { total_segments: number; latest_segment_at: string | null }>();
    if (nvrStatus?.cameras) {
      for (const c of nvrStatus.cameras) {
        if (c.camera_id) {
          map.set(c.camera_id, {
            total_segments: c.total_segments || 0,
            latest_segment_at: c.latest_segment_at,
          });
        }
      }
    }
    return map;
  }, [nvrStatus]);

  const handleNotificationClick = (n: NotificationItem) => {
    if (n.camera_id) {
      let url = `/playback?camera_id=${n.camera_id}`;
      if (n.created_at) {
        const ts = new Date(n.created_at).getTime();
        if (!isNaN(ts)) url += `&t=${ts}`;
      }
      navigate(url);
    } else {
      navigate('/playback');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-black p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* ── Top Header & Operations Ribbon ─────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900/90 p-5 sm:p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs backdrop-blur-md">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white shadow-md shadow-orange-500/20">
              <Gauge size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">
                  {t('home.title')}
                </h1>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/80">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  {t('home.allHealthy')}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                {t('home.subtitle')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Live Clock */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/60 text-xs font-mono font-bold text-slate-700 dark:text-slate-200">
              <Clock size={14} className="text-orange-500" />
              <span>{currentTime}</span>
            </div>

            {/* Refresh Button */}
            <button
              onClick={() => fetchDashboardData(false)}
              disabled={refreshing}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 text-slate-700 dark:text-slate-200 font-semibold text-xs transition-all border border-slate-200/80 dark:border-slate-700/80 cursor-pointer disabled:opacity-50"
              title={t('home.refresh')}
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin text-orange-500' : ''} />
              <span className="hidden xs:inline">{t('home.refresh')}</span>
            </button>
          </div>
        </div>

        {/* ── Tier 1: 4 High-Impact KPI Quick-Look Cards ─────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* KPI 1: Camera Fleet */}
          <div
            onClick={() => navigate('/devices')}
            className="group bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-orange-500/50 dark:hover:border-orange-500/40 transition-all cursor-pointer flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">
                {t('home.cameraFleet')}
              </span>
              <div className="w-9 h-9 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Camera size={18} />
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-slate-900 dark:text-white">
                  {onlineCameras}
                </span>
                <span className="text-sm font-bold text-slate-400 dark:text-slate-400">
                  / {totalCameras} online
                </span>
              </div>

              {/* Progress bar ratio */}
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${totalCameras > 0 ? (onlineCameras / totalCameras) * 100 : 0}%` }}
                />
              </div>

              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-[11px] font-semibold">
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <Sparkles size={11} />
                  {aiCameras} AI
                </span>
                <span className="text-slate-300 dark:text-slate-700">•</span>
                <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400">
                  <Activity size={11} />
                  {nvrCameras} NVR
                </span>
              </div>
            </div>
          </div>

          {/* KPI 2: Storage & NVR Retention */}
          <div
            onClick={() => navigate('/recorder')}
            className="group bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-blue-500/50 dark:hover:border-blue-500/40 transition-all cursor-pointer flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">
                {t('home.nvrStorage')}
              </span>
              <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <HardDrive size={18} />
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-slate-900 dark:text-white">
                  {storageUsedGb}
                </span>
                <span className="text-sm font-bold text-slate-400 dark:text-slate-400">
                  / {storageQuotaGb} GB ({storageUsedPercent}%)
                </span>
              </div>

              {/* Segmented storage progress bar */}
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    storageUsedPercent > 85
                      ? 'bg-rose-500'
                      : storageUsedPercent > 70
                        ? 'bg-amber-500'
                        : 'bg-blue-500'
                  }`}
                  style={{ width: `${storageUsedPercent}%` }}
                />
              </div>

              <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                <span>{t('home.retentionDays', { days: retentionDays })}</span>
                <span className="font-mono text-slate-600 dark:text-slate-300">
                  {t('home.storageFree', { free: storageFreeGb })}
                </span>
              </div>
            </div>
          </div>

          {/* KPI 3: Live Viewers & Stream Pool */}
          <div
            onClick={() => navigate('/pool')}
            className="group bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-indigo-500/50 dark:hover:border-indigo-500/40 transition-all cursor-pointer flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">
                {t('home.liveViewers')}
              </span>
              <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Users size={18} />
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-slate-900 dark:text-white">
                  {activeViewers}
                </span>
                <span className="text-sm font-bold text-slate-400 dark:text-slate-400">
                  {t('pool.clientsLabel')}
                </span>
              </div>

              {/* Channel indicators */}
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
                <div
                  className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(15, activeViewers * 20))}%` }}
                />
              </div>

              <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-[11px] font-semibold">
                <span className="text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                  <Tv size={11} />
                  {liveStreams} Live WebRTC
                </span>
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <Cpu size={11} />
                  {cvStreams} CV AI
                </span>
              </div>
            </div>
          </div>

          {/* KPI 4: AI Security Detections */}
          <div
            onClick={() => navigate('/playback')}
            className="group bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-red-500/50 dark:hover:border-red-500/40 transition-all cursor-pointer flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">
                {t('home.aiDetections')}
              </span>
              <div className="w-9 h-9 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <AlertTriangle size={18} />
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-slate-900 dark:text-white">
                  {notifications.length}
                </span>
                <span className="text-sm font-bold text-slate-400 dark:text-slate-400">
                  {t('home.todayAlerts', { count: '' }).trim()}
                </span>
              </div>

              <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    strangerAlertsCount > 0 ? 'bg-red-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(20, notifications.length * 10))}%` }}
                />
              </div>

              <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-[11px] font-semibold">
                <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                  {strangerAlertsCount} người lạ
                </span>
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <ShieldCheck size={11} />
                  {familyGuestsCount} quen
                </span>
              </div>
            </div>
          </div>

        </div>

        {/* ── Tier 2: Operational Matrix (Left: 65% / Right: 35%) ────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Left Column (8 of 12 cols = 66.6%) */}
          <div className="lg:col-span-8 space-y-6">

            {/* Block A: Live Camera Fleet Matrix */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs p-5 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <Radio size={18} className="text-orange-500" />
                    {t('home.cameraMatrix')}
                  </h2>
                  <p className="text-xs text-slate-400 dark:text-slate-400 mt-0.5">
                    {t('home.cameraMatrixDesc')}
                  </p>
                </div>
                <button
                  onClick={() => navigate('/devices')}
                  className="flex items-center gap-1 text-xs font-semibold text-orange-600 dark:text-orange-400 hover:underline cursor-pointer"
                >
                  <span>{t('common.all')}</span>
                  <ChevronRight size={14} />
                </button>
              </div>

              {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-36 bg-slate-100 dark:bg-slate-800/60 rounded-2xl animate-pulse" />
                  ))}
                </div>
              ) : cameras.length === 0 ? (
                <div className="text-center py-10 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                  <Camera size={32} className="mx-auto text-slate-400 dark:text-slate-600 mb-2" />
                  <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                    {t('home.noCamerasFound')}
                  </p>
                  <button
                    onClick={() => navigate('/devices')}
                    className="mt-3 px-4 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold cursor-pointer transition-colors"
                  >
                    {t('home.addFirstCamera')}
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {cameras.map((cam) => {
                    const isLive = cam.is_active && !cam.is_stopped;
                    const viewersCount = cameraViewersMap.get(cam.id) || 0;
                    const nvrInfo = cameraNvrMap.get(cam.id);

                    return (
                      <div
                        key={cam.id}
                        className="bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700/80 rounded-2xl p-4 transition-all flex flex-col justify-between"
                      >
                        <div>
                          {/* Header: Name + Status */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                  !isLive
                                    ? 'bg-slate-400'
                                    : 'bg-emerald-500 ring-2 ring-emerald-100 dark:ring-emerald-950/80 shadow-xs'
                                }`}
                              />
                              <h3
                                className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate"
                                title={cam.name}
                              >
                                {cam.name}
                              </h3>
                            </div>

                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                isLive
                                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200/70 dark:border-emerald-800/60'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              {isLive ? 'Online' : 'Offline'}
                            </span>
                          </div>

                          {/* Tech specs row */}
                          <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
                            {cam.brand && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono">
                                {cam.brand}
                              </span>
                            )}
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono">
                              {cam.rtsp_transport || 'TCP'}
                            </span>
                            {cam.enable_ai && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                                AI YOLO
                              </span>
                            )}
                            {cam.nvr_mode && cam.nvr_mode !== 'disabled' && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300">
                                NVR {cam.nvr_mode}
                              </span>
                            )}
                          </div>

                          {/* Telemetry row */}
                          <div className="mt-3 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between border-t border-slate-200/60 dark:border-slate-800 pt-2 font-mono">
                            <span className="flex items-center gap-1">
                              <Users size={12} className="text-indigo-500" />
                              {viewersCount} {t('pool.clientsLabel')}
                            </span>
                            {nvrInfo && (
                              <span className="text-slate-400 dark:text-slate-500">
                                {nvrInfo.total_segments} segs
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Quick Jump Buttons */}
                        <div className="grid grid-cols-2 gap-2 mt-3 pt-2">
                          <button
                            onClick={() => navigate(`/multiview`)}
                            className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold border border-slate-200/80 dark:border-slate-700/80 transition-all cursor-pointer shadow-2xs"
                          >
                            <Tv size={13} className="text-orange-500" />
                            <span>{t('home.viewLive')}</span>
                          </button>
                          <button
                            onClick={() => navigate(`/playback?camera_id=${cam.id}`)}
                            className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold border border-slate-200/80 dark:border-slate-700/80 transition-all cursor-pointer shadow-2xs"
                          >
                            <Video size={13} className="text-blue-500" />
                            <span>{t('home.viewPlayback')}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Block B: Storage Allocation & Segments Visualizer */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs p-5 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <HardDrive size={18} className="text-blue-500" />
                  <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100">
                    {t('home.storageBreakdown')}
                  </h3>
                </div>
                <button
                  onClick={() => navigate('/recorder')}
                  className="flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  <span>{t('nav.nvrMonitor')}</span>
                  <ChevronRight size={14} />
                </button>
              </div>

              {/* Storage bar visualization */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
                  <span>{t('home.storageQuota', { used: storageUsedGb, quota: storageQuotaGb, percent: storageUsedPercent })}</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400">
                    {t('home.storageFree', { free: storageFreeGb })}
                  </span>
                </div>
                <div className="w-full h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden flex">
                  <div
                    className={`h-full transition-all duration-500 ${
                      storageUsedPercent > 85 ? 'bg-rose-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${storageUsedPercent}%` }}
                  />
                  <div
                    className="h-full bg-emerald-500/40 transition-all duration-500"
                    style={{ width: `${100 - storageUsedPercent}%` }}
                  />
                </div>

                {/* Segments Table Preview */}
                {nvrStatus?.cameras && nvrStatus.cameras.length > 0 && (
                  <div className="mt-4 divide-y divide-slate-200/60 dark:divide-slate-800">
                    {nvrStatus.cameras.map((c) => (
                      <div key={c.camera_id} className="py-2.5 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              c.status === 'recording' ? 'bg-emerald-500' : 'bg-slate-400'
                            }`}
                          />
                          <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                            {c.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 font-mono text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                          <span>{t('home.totalSegments', { count: c.total_segments })}</span>
                          {c.latest_segment_at && (
                            <span className="text-slate-400 dark:text-slate-500 hidden sm:inline">
                              {dayjs(c.latest_segment_at).fromNow()}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Right Column (4 of 12 cols = 33.3%) */}
          <div className="lg:col-span-4 space-y-6">

            {/* Block C: Real-Time AI Security Activity Feed */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs p-5 sm:p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={18} className="text-red-500" />
                    <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100">
                      {t('home.recentEvents')}
                    </h3>
                  </div>
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                </div>

                <p className="text-xs text-slate-400 dark:text-slate-400 mb-4">
                  {t('home.recentEventsDesc')}
                </p>

                {/* Event list */}
                <div className="space-y-2.5 max-h-[420px] overflow-y-auto custom-scrollbar pr-1">
                  {notifications.length === 0 ? (
                    <div className="text-center py-8 text-xs text-slate-400 dark:text-slate-500">
                      {t('home.noEventsToday')}
                    </div>
                  ) : (
                    notifications.map((n) => {
                      const isStranger = n.category === 'stranger';
                      const isFamily = n.category === 'family' || n.category === 'member';

                      return (
                        <div
                          key={n.id}
                          onClick={() => handleNotificationClick(n)}
                          className={`p-3 rounded-2xl border transition-all cursor-pointer group flex items-start gap-2.5 ${
                            isStranger
                              ? 'bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-900/40 hover:bg-red-50/80 dark:hover:bg-red-950/40'
                              : isFamily
                                ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40 hover:bg-emerald-50/70 dark:hover:bg-emerald-950/30'
                                : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                          title={t('home.clickToPlayback')}
                        >
                          {/* Icon Category */}
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                              isStranger
                                ? 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400'
                                : isFamily
                                  ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400'
                                  : 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400'
                            }`}
                          >
                            {isStranger ? (
                              <AlertTriangle size={14} />
                            ) : isFamily ? (
                              <ShieldCheck size={14} />
                            ) : (
                              <HeartHandshake size={14} />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                                {n.title}
                              </h4>
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono shrink-0">
                                {dayjs(n.created_at).fromNow()}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-1 mt-0.5">
                              {formatNotificationBody(n.body, n.created_at)}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={() => navigate('/playback')}
                  className="w-full py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Video size={13} />
                  <span>{t('home.viewAllEvents')}</span>
                </button>
              </div>
            </div>

            {/* Block D: Admin Quick Operations Hub */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs p-5 sm:p-6">
              <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100 mb-3 flex items-center gap-2">
                <Sliders size={16} className="text-orange-500" />
                {t('home.quickActions')}
              </h3>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  onClick={() => navigate('/devices')}
                  className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 hover:bg-orange-50 dark:hover:bg-orange-950/30 border border-slate-200/80 dark:border-slate-800 hover:border-orange-200 dark:hover:border-orange-800/60 transition-all text-left group cursor-pointer"
                >
                  <div className="w-7 h-7 rounded-lg bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                    <Plus size={15} />
                  </div>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block truncate">
                    {t('home.actionAddCamera')}
                  </span>
                </button>

                <button
                  onClick={() => navigate('/members')}
                  className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 border border-slate-200/80 dark:border-slate-800 hover:border-emerald-200 dark:hover:border-emerald-800/60 transition-all text-left group cursor-pointer"
                >
                  <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                    <Users size={15} />
                  </div>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block truncate">
                    {t('home.actionManageMembers')}
                  </span>
                </button>

                <button
                  onClick={() => navigate('/recorder')}
                  className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 hover:bg-blue-50 dark:hover:bg-blue-950/30 border border-slate-200/80 dark:border-slate-800 hover:border-blue-200 dark:hover:border-blue-800/60 transition-all text-left group cursor-pointer"
                >
                  <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                    <HardDrive size={15} />
                  </div>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block truncate">
                    {t('home.actionNvrSettings')}
                  </span>
                </button>

                <button
                  onClick={() => navigate('/app-configs')}
                  className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 border border-slate-200/80 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-800/60 transition-all text-left group cursor-pointer"
                >
                  <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                    <FileShield size={15} />
                  </div>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block truncate">
                    {t('home.actionAppConfigs')}
                  </span>
                </button>

                <button
                  onClick={() => navigate('/users')}
                  className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 hover:bg-purple-50 dark:hover:bg-purple-950/30 border border-slate-200/80 dark:border-slate-800 hover:border-purple-200 dark:hover:border-purple-800/60 transition-all text-left group cursor-pointer"
                >
                  <div className="w-7 h-7 rounded-lg bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                    <UserCog size={15} />
                  </div>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block truncate">
                    {t('home.actionManageUsers')}
                  </span>
                </button>

                <button
                  onClick={() => navigate('/pool')}
                  className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 hover:bg-cyan-50 dark:hover:bg-cyan-950/30 border border-slate-200/80 dark:border-slate-800 hover:border-cyan-200 dark:hover:border-cyan-800/60 transition-all text-left group cursor-pointer"
                >
                  <div className="w-7 h-7 rounded-lg bg-cyan-100 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                    <Layers size={15} />
                  </div>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block truncate">
                    {t('home.actionViewPool')}
                  </span>
                </button>
              </div>
            </div>

          </div>

        </div>

        {/* ── Tier 3: Microservice Cluster Health Telemetry ──────────────── */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Server size={18} className="text-emerald-500" />
              <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100">
                {t('home.servicesHealth')}
              </h3>
            </div>
            
            {nvrStatus?.system && (
              <div className="flex items-center gap-3 text-xs font-mono text-slate-500 dark:text-slate-400">
                <span>CPU: {nvrStatus.system.cpu_usage_percent?.toFixed(1) || 0}%</span>
                <span>•</span>
                <span>RAM: {nvrStatus.system.memory_alloc_mb?.toFixed(0) || 0} MB</span>
                <span>•</span>
                <span>Uptime: {formatUptime(nvrStatus.system.uptime_seconds)}</span>
                <span>•</span>
                <span>{nvrStatus.system.goroutines || 0} goroutines</span>
              </div>
            )}
          </div>

          {/* Microservice Health Pills */}
          <div className="flex items-center gap-2 flex-wrap text-xs font-semibold">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/70 text-slate-700 dark:text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {t('home.gateway')} (:8088)
            </span>

            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/70 text-slate-700 dark:text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {t('home.coreService')}
            </span>

            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/70 text-slate-700 dark:text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {t('home.authService')}
            </span>

            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/70 text-slate-700 dark:text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {t('home.poolService')}
            </span>

            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/70 text-slate-700 dark:text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {t('home.webrtcService')} (:8555)
            </span>

            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/70 text-slate-700 dark:text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {t('home.visionService')} (YOLO)
            </span>

            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/70 text-slate-700 dark:text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {t('home.nvrService')}
            </span>

            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/70 text-slate-700 dark:text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {t('home.relayService')}
            </span>

            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/70 text-slate-700 dark:text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {t('home.dbService')}
            </span>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Home;
