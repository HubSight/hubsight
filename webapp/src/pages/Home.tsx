import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera,
  HardDrive,
  Users,
  Layers,
  Activity,
  Cpu,
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
  useRealtimeStatus,
} from '@hubsight/sdk/react';
import { useTranslation } from '../i18n';
import { useTimezone } from '../context/TimezoneContext';
import { PageHeader } from '../components/common/PageHeader';
import { PullToRefresh } from '../components/common/PullToRefresh';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

interface TelemetryPoint {
  timestamp: number;
  cpu: number;
  memory: number;
  viewers: number;
}

export const Home: React.FC = () => {
  const { t } = useTranslation();
  const { formatNotificationBody } = useTimezone();
  const navigate = useNavigate();
  const { isConnected: isSocketConnected } = useRealtimeStatus();

  const [cameras, setCameras] = useState<CameraType[]>([]);
  const [poolStatus, setPoolStatus] = useState<PoolStatusSummary | null>(null);
  const [nvrStatus, setNvrStatus] = useState<NvrStatusResponse | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentTime, setCurrentTime] = useState<string>(dayjs().format('HH:mm:ss'));

  // Rolling telemetry time-series buffer (up to 24 points)
  const [telemetryHistory, setTelemetryHistory] = useState<TelemetryPoint[]>([]);
  const [activeTelemetryTab, setActiveTelemetryTab] = useState<'cpu' | 'memory' | 'viewers'>('cpu');

  const isPollingRef = useRef(false);

  // ── Camera Snapshot Cache ─────────────────────────────────────────────────
  // Maps cameraId → { dataUrl: string; fetchedAt: number }
  // Refreshes automatically if older than SNAPSHOT_TTL_MS
  interface SnapshotEntry { dataUrl: string; fetchedAt: number; }
  const snapshotCacheRef = useRef<Map<string, SnapshotEntry>>(new Map());
  const [snapshotRevision, setSnapshotRevision] = useState(0);
  const SNAPSHOT_TTL_MS = 90_000; // how long a *successful* snapshot stays fresh
  // The media server's ffmpeg-based MJPEG snapshot generator is intermittently flaky
  // (transient "Broken pipe" transcode failures) — a camera whose snapshot
  // never succeeded would otherwise sit on "No stream" for a full 90s TTL
  // cycle before the next attempt. The TTL check inside fetchSnapshot already
  // throttles cameras with a fresh successful snapshot, so polling faster
  // here only affects cameras that don't have one yet (or went stale).
  const SNAPSHOT_RETRY_POLL_MS = 8_000;

  /** Pick stream name for snapshot: each active camera maintains a persistent 640p 15FPS thumb stream */
  const getSnapshotStreamName = useCallback((cam: CameraType): string | null => {
    if (!cam.is_active || cam.is_stopped) return null;
    return `cam_${cam.id}_thumb`;
  }, []);

  /** Fetch a snapshot JPEG blob from the media server via the gateway and store as data URL */
  const fetchSnapshot = useCallback(async (cam: CameraType): Promise<void> => {
    const streamName = getSnapshotStreamName(cam);
    if (!streamName) return;

    const now = Date.now();
    const cached = snapshotCacheRef.current.get(cam.id);
    if (cached && now - cached.fetchedAt < SNAPSHOT_TTL_MS) return; // still fresh

    try {
      let res = await fetch(`/webrtc/api/frame.jpeg?src=${encodeURIComponent(streamName)}`, {
        credentials: 'include',
        headers: { 'X-API-Key': 'hs_web_client_core', 'X-Client-ID': 'hs_web_client_core' },
        cache: 'no-store',
      });
      if (!res.ok) {
        // Fallback to core backend snapshot endpoint
        res = await fetch(`/api/cameras/${cam.id}/snapshot`, {
          credentials: 'include',
          cache: 'no-store',
        });
      }
      if (!res.ok) return;
      const blob = await res.blob();
      if (!blob.type.startsWith('image/')) return;

      // Revoke any previous object URL to avoid memory leak
      const prev = snapshotCacheRef.current.get(cam.id);
      if (prev?.dataUrl.startsWith('blob:')) URL.revokeObjectURL(prev.dataUrl);

      snapshotCacheRef.current.set(cam.id, {
        dataUrl: URL.createObjectURL(blob),
        fetchedAt: now,
      });
      setSnapshotRevision((r) => r + 1); // trigger re-render
    } catch {
      // Silently ignore — camera may simply not have an active stream yet
    }
  }, [getSnapshotStreamName, SNAPSHOT_TTL_MS]);

  /** Kick off snapshot fetches for all live cameras (staggered to avoid burst) */
  const refreshSnapshots = useCallback((cams: CameraType[]) => {
    cams.forEach((cam, idx) => {
      setTimeout(() => void fetchSnapshot(cam), idx * 200);
    });
  }, [fetchSnapshot]);

  // Digital clock tick
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

      let curCpu = 0;
      let curMem = 0;
      let curViewers = 0;

      if (camsRes.status === 'fulfilled') {
        setCameras(camsRes.value);
      }
      if (poolRes.status === 'fulfilled') {
        setPoolStatus(poolRes.value);
        curViewers = poolRes.value.total_active_viewers || 0;
      }
      if (nvrRes.status === 'fulfilled') {
        setNvrStatus(nvrRes.value);
        curCpu = Number(nvrRes.value.system?.cpu_usage_percent?.toFixed(1)) || 0;
        curMem = Math.round(nvrRes.value.system?.memory_alloc_mb || 0);
      }
      if (notifsRes.status === 'fulfilled') setNotifications(notifsRes.value.notifications || []);

      // Push real sample to rolling history
      setTelemetryHistory((prev) => {
        const next = [...prev, { timestamp: Date.now(), cpu: curCpu, memory: curMem, viewers: curViewers }];
        return next.slice(-24);
      });
    } catch (err) {
      console.error('Failed to refresh dashboard telemetry:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial Load
  useEffect(() => {
    fetchDashboardData(false);
  }, [fetchDashboardData]);

  // Real-time Periodic Heartbeat (Every 3.5s for continuous live metrics and rolling wave chart)
  useEffect(() => {
    const interval = setInterval(async () => {
      if (isPollingRef.current) return;
      isPollingRef.current = true;
      try {
        const [poolRes, nvrRes] = await Promise.allSettled([
          api.pool.status(),
          api.recorder.status(),
        ]);

        let curCpu = 0;
        let curMem = 0;
        let curViewers = 0;

        if (poolRes.status === 'fulfilled') {
          setPoolStatus(poolRes.value);
          curViewers = poolRes.value.total_active_viewers || 0;
        }
        if (nvrRes.status === 'fulfilled') {
          setNvrStatus(nvrRes.value);
          curCpu = Number(nvrRes.value.system?.cpu_usage_percent?.toFixed(1)) || 0;
          curMem = Math.round(nvrRes.value.system?.memory_alloc_mb || 0);
        }

        setTelemetryHistory((prev) => {
          const next = [...prev, { timestamp: Date.now(), cpu: curCpu, memory: curMem, viewers: curViewers }];
          return next.slice(-24);
        });
      } catch {
        // Ignore background polling errors
      } finally {
        isPollingRef.current = false;
      }
    }, 3500);

    return () => clearInterval(interval);
  }, []);

  // Top 4 cameras displayed on dashboard (prioritizes live/active, then natural name A-Z)
  const displayedCameras = useMemo(() => {
    const sorted = [...cameras].sort((a, b) => {
      const aLive = a.is_active && !a.is_stopped ? 1 : 0;
      const bLive = b.is_active && !b.is_stopped ? 1 : 0;
      if (aLive !== bLive) return bLive - aLive;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });
    return sorted.slice(0, 4);
  }, [cameras]);

  // Periodic Snapshot Refresh for the top 4 dashboard cameras. Ticks every
  // SNAPSHOT_RETRY_POLL_MS, but fetchSnapshot's own SNAPSHOT_TTL_MS check
  // skips cameras that already have a fresh snapshot — so this only actually
  // hits the media server for cameras still stuck without one (fast recovery from a
  // transient snapshot failure instead of waiting a full 90s).
  useEffect(() => {
    if (displayedCameras.length === 0) return;
    refreshSnapshots(displayedCameras);
    const interval = setInterval(() => {
      refreshSnapshots(displayedCameras);
    }, SNAPSHOT_RETRY_POLL_MS);
    return () => clearInterval(interval);
  }, [displayedCameras, refreshSnapshots]);

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

  // Overall system operational status
  const isSystemOnline = isSocketConnected;

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

  // ── 24-Hour AI Activity Buckets Calculation ───────────────────────────────
  const hourlyActivityBuckets = useMemo(() => {
    // 6 4-hour buckets: 00-04, 04-08, 08-12, 12-16, 16-20, 20-24
    const buckets = [
      { label: '00-04h', strangers: 0, members: 0, total: 0 },
      { label: '04-08h', strangers: 0, members: 0, total: 0 },
      { label: '08-12h', strangers: 0, members: 0, total: 0 },
      { label: '12-16h', strangers: 0, members: 0, total: 0 },
      { label: '16-20h', strangers: 0, members: 0, total: 0 },
      { label: '20-24h', strangers: 0, members: 0, total: 0 },
    ];

    notifications.forEach((n) => {
      const d = dayjs(n.created_at);
      const hour = d.hour();
      const bucketIdx = Math.min(5, Math.floor(hour / 4));
      if (n.category === 'stranger') {
        buckets[bucketIdx].strangers += 1;
      } else {
        buckets[bucketIdx].members += 1;
      }
      buckets[bucketIdx].total += 1;
    });

    return buckets;
  }, [notifications]);

  const maxBucketCount = useMemo(() => {
    return Math.max(1, ...hourlyActivityBuckets.map((b) => b.total));
  }, [hourlyActivityBuckets]);

  // ── Telemetry Chart Data Calculations ─────────────────────────────────────
  const telemetryStats = useMemo(() => {
    if (telemetryHistory.length === 0) {
      return { current: 0, peak: 0, avg: 0 };
    }
    const values = telemetryHistory.map((p) =>
      activeTelemetryTab === 'cpu'
        ? p.cpu
        : activeTelemetryTab === 'memory'
          ? p.memory
          : p.viewers
    );
    const current = values[values.length - 1];
    const peak = Math.max(...values);
    const avg = Number((values.reduce((sum, v) => sum + v, 0) / values.length).toFixed(1));
    return { current, peak, avg };
  }, [telemetryHistory, activeTelemetryTab]);

  // Generate SVG Bezier Path for Realtime Wave Chart
  const waveSvgPath = useMemo(() => {
    if (telemetryHistory.length < 2) return { line: '', area: '' };

    const width = 900;
    const height = 180;
    const padding = 12;
    const plotW = width - padding * 2;
    const plotH = height - padding * 2;

    const values = telemetryHistory.map((p) =>
      activeTelemetryTab === 'cpu'
        ? p.cpu
        : activeTelemetryTab === 'memory'
          ? p.memory
          : p.viewers
    );

    const maxVal = Math.max(
      activeTelemetryTab === 'cpu' ? 100 : activeTelemetryTab === 'memory' ? 1000 : 10,
      ...values,
      1
    );

    const points = values.map((val, idx) => {
      const x = padding + (idx / (values.length - 1)) * plotW;
      const y = height - padding - (val / maxVal) * plotH;
      return { x, y };
    });

    // Build smooth cubic Bezier path
    let line = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const cpX = (p0.x + p1.x) / 2;
      line += ` C ${cpX} ${p0.y}, ${cpX} ${p1.y}, ${p1.x} ${p1.y}`;
    }

    const lastX = points[points.length - 1].x;
    const firstX = points[0].x;
    const bottomY = height - padding;
    const area = `${line} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;

    return { line, area, lastPoint: points[points.length - 1] };
  }, [telemetryHistory, activeTelemetryTab]);

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50/50 dark:bg-slate-950/50 overflow-hidden">
      {/* ── Standard Unified Page Header ─────────────────────────────── */}
      <PageHeader
        icon={Gauge}
        title={t('home.title')}
        subtitle={t('home.subtitle')}
        badge={
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold border ${
              isSystemOnline
                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/80'
                : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/80'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isSystemOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
              }`}
            />
            {isSystemOnline ? t('home.allHealthy') : t('home.serviceOffline')}
          </span>
        }
        actions={
          <>
            {/* Live Clock */}
            <div className="hidden sm:flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/60 text-xs font-mono font-bold text-slate-700 dark:text-slate-200">
              <Clock size={14} className="text-orange-500" />
              <span>{currentTime}</span>
            </div>

            {/* Refresh Button */}
            <button
              onClick={() => fetchDashboardData(false)}
              disabled={refreshing}
              className="h-9 w-9 min-w-9 min-h-9 aspect-square flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 text-slate-700 dark:text-slate-200 font-semibold text-xs transition-all border border-slate-200/80 dark:border-slate-700/80 cursor-pointer disabled:opacity-50 shrink-0"
              title={t('home.refresh')}
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin text-orange-500' : ''} />
            </button>
          </>
        }
      />

      {/* ── Scrollable Dashboard Content with PullToRefresh ───────────── */}
      <PullToRefresh onRefresh={() => fetchDashboardData(false)} className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="w-full space-y-6">

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
                  {strangerAlertsCount} {t('home.strangerLabel').toLowerCase()}
                </span>
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <ShieldCheck size={11} />
                  {familyGuestsCount} {t('home.familyLabel').toLowerCase()}
                </span>
              </div>
            </div>
          </div>

        </div>

        {/* ── Section 2: Live Camera Fleet Matrix (Full Width) ──────────── */}
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
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate('/devices')}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold transition-all cursor-pointer shadow-2xs"
              >
                <Plus size={13} />
                <span>{t('devices.addManual')}</span>
              </button>
              <button
                onClick={() => navigate('/devices')}
                className="flex items-center gap-1 text-xs font-semibold text-orange-600 dark:text-orange-400 hover:underline cursor-pointer"
              >
                <span>
                  {t('common.all')}
                  {cameras.length > 4 ? ` (${cameras.length})` : ''}
                </span>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="rounded-2xl overflow-hidden bg-slate-100 dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 animate-pulse">
                  <div className="w-full aspect-video bg-slate-200 dark:bg-zinc-800" />
                  <div className="p-3 space-y-2">
                    <div className="h-3.5 bg-slate-200 dark:bg-zinc-800 rounded w-2/3" />
                    <div className="h-3 bg-slate-200 dark:bg-zinc-800 rounded w-1/3" />
                    <div className="h-7 bg-slate-200 dark:bg-zinc-800 rounded-xl mt-2" />
                  </div>
                </div>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {/* snapshotRevision is used to trigger re-reads from the cache map when blobs are fetched */}
              {displayedCameras.map((cam) => {
                const isLive = cam.is_active && !cam.is_stopped;
                const viewersCount = cameraViewersMap.get(cam.id) || 0;
                const nvrInfo = cameraNvrMap.get(cam.id);
                const snapshot = snapshotRevision >= 0 ? snapshotCacheRef.current.get(cam.id) : undefined;
                const hasSnapshot = Boolean(snapshot?.dataUrl);
                const snapshotAgeS = snapshot ? Math.round((Date.now() - snapshot.fetchedAt) / 1000) : 0;

                return (
                  <div
                    key={cam.id}
                    className="bg-slate-50/80 dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 rounded-2xl transition-all flex flex-col overflow-hidden"
                  >
                    {/* ── Thumbnail Area ── */}
                    <div className="relative w-full aspect-video bg-zinc-950 overflow-hidden rounded-t-2xl">
                      {hasSnapshot ? (
                        <img
                          src={snapshot!.dataUrl}
                          alt={cam.name}
                          className="w-full h-full object-cover"
                          draggable={false}
                        />
                      ) : (
                        /* No-signal placeholder */
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
                          <div className="w-9 h-9 rounded-full bg-zinc-800/80 flex items-center justify-center">
                            <Camera size={18} className="text-zinc-500" />
                          </div>
                          <span className="text-[10px] font-mono text-zinc-600 tracking-wider uppercase">
                            {isLive ? 'No stream' : 'Offline'}
                          </span>
                        </div>
                      )}

                      {/* Status badge overlay (top-left) */}
                      <div className="absolute top-2 left-2 flex items-center gap-1.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider backdrop-blur-sm ${
                          isLive
                            ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                            : 'bg-zinc-900/80 text-zinc-400 border border-zinc-700/60'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-500'}`} />
                          {isLive ? 'LIVE' : 'OFFLINE'}
                        </span>
                      </div>

                      {/* AI / NVR badges (top-right) */}
                      <div className="absolute top-2 right-2 flex gap-1">
                        {cam.enable_ai && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-violet-950/80 text-violet-300 border border-violet-800/60 backdrop-blur-sm">
                            AI
                          </span>
                        )}
                        {cam.nvr_mode && cam.nvr_mode !== 'disabled' && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-950/80 text-blue-300 border border-blue-800/60 backdrop-blur-sm">
                            NVR
                          </span>
                        )}
                      </div>

                      {/* Snapshot age hint (bottom-right, only when snapshot exists) */}
                      {hasSnapshot && (
                        <div className="absolute bottom-1.5 right-2">
                          <span className="text-[9px] font-mono text-white/50 bg-black/40 px-1.5 py-0.5 rounded-full backdrop-blur-sm">
                            {snapshotAgeS < 60 ? `${snapshotAgeS}s ago` : `${Math.round(snapshotAgeS / 60)}m ago`}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* ── Info Section ── */}
                    <div className="flex flex-col justify-between flex-1 p-3">
                      {/* Name + tech tags */}
                      <div>
                        <div className="flex items-center gap-2 min-w-0 mb-2">
                          <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate flex-1" title={cam.name}>
                            {cam.name}
                          </h3>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {cam.brand && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-200/70 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 font-mono">
                              {cam.brand}
                            </span>
                          )}
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-200/70 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 font-mono">
                            {cam.rtsp_transport?.toUpperCase() || 'TCP'}
                          </span>
                        </div>
                      </div>

                      {/* Telemetry row */}
                      <div className="mt-2.5 text-[11px] text-slate-500 dark:text-zinc-500 flex items-center justify-between border-t border-slate-200/60 dark:border-zinc-800 pt-2 font-mono">
                        <span className="flex items-center gap-1">
                          <Users size={12} className="text-indigo-500" />
                          {viewersCount} {t('pool.clientsLabel')}
                        </span>
                        {nvrInfo && (
                          <span className="text-slate-400 dark:text-zinc-600">
                            {nvrInfo.total_segments} segs
                          </span>
                        )}
                      </div>

                      {/* Quick Jump Buttons */}
                      <div className="grid grid-cols-2 gap-2 mt-2.5">
                        <button
                          onClick={() => navigate(`/multiview`)}
                          className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl bg-white dark:bg-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 text-xs font-semibold border border-slate-200/80 dark:border-zinc-700/80 transition-all cursor-pointer shadow-2xs"
                        >
                          <Tv size={13} className="text-orange-500" />
                          <span>{t('home.viewLive')}</span>
                        </button>
                        <button
                          onClick={() => navigate(`/playback?camera_id=${cam.id}`)}
                          className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl bg-white dark:bg-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 text-xs font-semibold border border-slate-200/80 dark:border-zinc-700/80 transition-all cursor-pointer shadow-2xs"
                        >
                          <Video size={13} className="text-blue-500" />
                          <span>{t('home.viewPlayback')}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Section 3: Real-Time Telemetry & NVR Storage Matrix ──────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Chart 1: Real-time Live Telemetry Wave Chart (7 of 12 cols) */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs p-5 sm:p-6 flex flex-col justify-between">
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <Activity size={18} className="text-cyan-500" />
                    {t('home.chartTelemetryTitle')}
                  </h2>
                  <p className="text-xs text-slate-400 dark:text-slate-400 mt-0.5">
                    {t('home.chartTelemetrySub')}
                  </p>
                </div>

                {/* Switcher Tabs */}
                <div className="flex items-center bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl text-xs font-semibold self-start sm:self-auto">
                  <button
                    onClick={() => setActiveTelemetryTab('cpu')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                      activeTelemetryTab === 'cpu'
                        ? 'bg-white dark:bg-slate-700 text-cyan-600 dark:text-cyan-400 shadow-xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    {t('home.chartCpu')}
                  </button>
                  <button
                    onClick={() => setActiveTelemetryTab('memory')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                      activeTelemetryTab === 'memory'
                        ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    {t('home.chartRam')}
                  </button>
                  <button
                    onClick={() => setActiveTelemetryTab('viewers')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                      activeTelemetryTab === 'viewers'
                        ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    {t('home.chartTraffic')}
                  </button>
                </div>
              </div>

              {/* Stats Ribbon */}
              <div className="flex items-center gap-4 py-2 border-b border-slate-100 dark:border-slate-800 text-xs font-mono">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">{t('home.current')}:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">
                    {telemetryStats.current} {activeTelemetryTab === 'cpu' ? '%' : activeTelemetryTab === 'memory' ? 'MB' : 'users'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">{t('home.peak')}:</span>
                  <span className="font-bold text-amber-500">
                    {telemetryStats.peak} {activeTelemetryTab === 'cpu' ? '%' : activeTelemetryTab === 'memory' ? 'MB' : 'users'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">{t('home.average')}:</span>
                  <span className="font-bold text-slate-600 dark:text-slate-300">
                    {telemetryStats.avg}
                  </span>
                </div>
                <div className="ml-auto flex items-center gap-1.5 text-[11px] font-semibold text-emerald-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                  <span>3.5s Live</span>
                </div>
              </div>

              {/* Wave SVG Chart Canvas */}
              <div className="mt-3 relative w-full h-44 sm:h-52 flex items-center justify-center">
                {telemetryHistory.length < 2 ? (
                  <div className="text-xs text-slate-400 animate-pulse">
                    Đang thu thập mẫu đo đạc thời gian thực...
                  </div>
                ) : (
                  <svg viewBox="0 0 900 180" className="w-full h-full overflow-visible" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                      </linearGradient>
                      <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                      </linearGradient>
                      <linearGradient id="viewersGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Subtle Grid Guidelines */}
                    <line x1="0" y1="30" x2="900" y2="30" stroke="currentColor" className="text-slate-100 dark:text-slate-800/80" strokeDasharray="3 3" />
                    <line x1="0" y1="90" x2="900" y2="90" stroke="currentColor" className="text-slate-100 dark:text-slate-800/80" strokeDasharray="3 3" />
                    <line x1="0" y1="150" x2="900" y2="150" stroke="currentColor" className="text-slate-100 dark:text-slate-800/80" />

                    {/* Filled Area */}
                    <path
                      d={waveSvgPath.area}
                      fill={
                        activeTelemetryTab === 'cpu'
                          ? 'url(#cpuGrad)'
                          : activeTelemetryTab === 'memory'
                            ? 'url(#memGrad)'
                            : 'url(#viewersGrad)'
                      }
                      className="transition-all duration-300"
                    />

                    {/* Stroke Curve */}
                    <path
                      d={waveSvgPath.line}
                      fill="none"
                      stroke={
                        activeTelemetryTab === 'cpu'
                          ? '#06b6d4'
                          : activeTelemetryTab === 'memory'
                            ? '#10b981'
                            : '#6366f1'
                      }
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="transition-all duration-300"
                    />

                    {/* Current head dot */}
                    {waveSvgPath.lastPoint && (
                      <g>
                        <circle
                          cx={waveSvgPath.lastPoint.x}
                          cy={waveSvgPath.lastPoint.y}
                          r="5"
                          fill={
                            activeTelemetryTab === 'cpu'
                              ? '#06b6d4'
                              : activeTelemetryTab === 'memory'
                                ? '#10b981'
                                : '#6366f1'
                          }
                          className="animate-pulse"
                        />
                        <circle
                          cx={waveSvgPath.lastPoint.x}
                          cy={waveSvgPath.lastPoint.y}
                          r="9"
                          fill="none"
                          stroke={
                            activeTelemetryTab === 'cpu'
                              ? '#06b6d4'
                              : activeTelemetryTab === 'memory'
                                ? '#10b981'
                                : '#6366f1'
                          }
                          strokeWidth="1.5"
                          opacity="0.5"
                        />
                      </g>
                    )}
                  </svg>
                )}
              </div>
            </div>

            <div className="mt-2 text-[11px] text-slate-400 flex items-center justify-between font-mono pt-2 border-t border-slate-100 dark:border-slate-800">
              <span>Đo đạc trực tiếp qua gRPC & Go Runtime</span>
              <span>24 mẫu gần nhất (~90s)</span>
            </div>
          </div>

          {/* Chart 2: Unified NVR Storage & Recorded Segments (5 of 12 cols) */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs p-5 sm:p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <HardDrive size={18} className="text-blue-500" />
                  <h2 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100">
                    {t('home.chartStorageTitle')}
                  </h2>
                </div>
                <button
                  onClick={() => navigate('/recorder')}
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer flex items-center gap-1"
                >
                  <span>{t('home.actionNvrSettings')}</span>
                  <ChevronRight size={13} />
                </button>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-400 mb-3">
                {t('home.chartStorageSub')}
              </p>

              {/* Donut Chart & Center Metric */}
              <div className="flex items-center justify-center gap-6 py-2">
                <div className="relative w-28 h-28 sm:w-32 sm:h-32 shrink-0">
                  <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                    {/* Background Ring */}
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke="currentColor"
                      className="text-slate-100 dark:text-slate-800"
                      strokeWidth="12"
                    />
                    {/* Used Ring Arc */}
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke={
                        storageUsedPercent > 85
                          ? '#f43f5e'
                          : storageUsedPercent > 70
                            ? '#f59e0b'
                            : '#3b82f6'
                      }
                      strokeWidth="12"
                      strokeDasharray={`${(storageUsedPercent * 251.2) / 100} 251.2`}
                      strokeLinecap="round"
                      className="transition-all duration-700"
                    />
                  </svg>
                  {/* Center percentage label */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-xl font-black text-slate-800 dark:text-slate-100 leading-none">
                      {storageUsedPercent}%
                    </span>
                    <span className="text-[10px] font-semibold text-slate-400 uppercase mt-0.5">
                      {t('home.storageUsedLabel')}
                    </span>
                  </div>
                </div>

                {/* Legend list */}
                <div className="space-y-1.5 text-xs font-semibold">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
                    <span className="text-slate-500 dark:text-slate-400">{t('home.storageUsedLabel')}:</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-100">{storageUsedGb} GB</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                    <span className="text-slate-500 dark:text-slate-400">{t('home.storageFreeLabel')}:</span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{storageFreeGb} GB</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-700 shrink-0" />
                    <span className="text-slate-500 dark:text-slate-400">{t('home.storageQuotaLabel')}:</span>
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{storageQuotaGb} GB</span>
                  </div>
                  <div className="flex items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                    <Clock size={12} className="text-orange-500 shrink-0" />
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {t('home.retentionDays', { days: retentionDays })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Comparative Segment Bars (Embedded in Storage Panel) */}
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Activity size={13} className="text-blue-500" />
                    {t('home.chartCameraStorageTitle')}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    {nvrStatus?.cameras?.length || 0} cameras
                  </span>
                </div>

                {nvrStatus?.cameras && nvrStatus.cameras.length > 0 ? (
                  <div className="space-y-2 max-h-[140px] overflow-y-auto custom-scrollbar pr-1">
                    {nvrStatus.cameras.map((c) => {
                      const maxSegs = Math.max(1, ...nvrStatus.cameras.map((cam) => cam.total_segments || 0));
                      const percent = Math.min(100, Math.round(((c.total_segments || 0) / maxSegs) * 100));

                      return (
                        <div key={c.camera_id} className="space-y-1">
                          <div className="flex items-center justify-between text-[11px] font-semibold">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span
                                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                  c.status === 'recording' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                                }`}
                              />
                              <span className="text-slate-800 dark:text-slate-200 truncate">
                                {c.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-500 dark:text-slate-400 shrink-0">
                              <span className="text-slate-800 dark:text-slate-200 font-bold">{c.total_segments} segs</span>
                              {c.latest_segment_at && (
                                <span className="hidden sm:inline text-slate-400">• {dayjs(c.latest_segment_at).fromNow()}</span>
                              )}
                            </div>
                          </div>

                          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-gradient-to-r from-blue-600 to-indigo-500 h-full rounded-full transition-all duration-500"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-400 py-2 text-center">
                    {t('home.noCamerasFound')}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-2 text-[11px] text-slate-400 flex items-center justify-between font-mono pt-2 border-t border-slate-100 dark:border-slate-800">
              <span>Đo đạc từ Linux statvfs</span>
              <span>Auto-retention active</span>
            </div>
          </div>

        </div>

        {/* ── Section 4: AI Security & Event Intelligence ─────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Chart 4: 24-Hour AI Security Activity Histogram (6 of 12 cols) */}
          <div className="lg:col-span-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs p-5 sm:p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={18} className="text-emerald-500" />
                  <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100">
                    {t('home.chartActivityTitle')}
                  </h3>
                </div>
                <span className="text-xs font-mono font-bold text-slate-500">{notifications.length} evts</span>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-400 mb-4">
                {t('home.chartActivitySub')}
              </p>

              {/* Histogram Bars */}
              <div className="flex items-end justify-between gap-2 h-36 pt-4 pb-1 border-b border-slate-100 dark:border-slate-800">
                {hourlyActivityBuckets.map((bucket) => {
                  const barHeight = bucket.total > 0 ? Math.max(14, Math.round((bucket.total / maxBucketCount) * 110)) : 4;
                  const strangerRatio = bucket.total > 0 ? (bucket.strangers / bucket.total) * 100 : 0;

                  return (
                    <div key={bucket.label} className="flex-1 flex flex-col items-center gap-1.5 group">
                      <div className="w-full flex items-end justify-center h-28">
                        <div
                          className="w-full max-w-[32px] rounded-t-lg transition-all duration-500 overflow-hidden flex flex-col justify-end group-hover:scale-105"
                          style={{ height: `${barHeight}px` }}
                          title={`${bucket.label}: ${bucket.total} (${bucket.strangers} người lạ)`}
                        >
                          {bucket.strangers > 0 && (
                            <div
                              className="bg-rose-500 w-full"
                              style={{ height: `${strangerRatio}%` }}
                            />
                          )}
                          <div
                            className="bg-emerald-500 w-full flex-1"
                          />
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200">
                        {bucket.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 flex items-center justify-between text-[11px] font-semibold">
                <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  {t('home.strangerLabel')}
                </span>
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  {t('home.familyLabel')}
                </span>
              </div>
            </div>

            <div className="mt-2 text-[11px] text-slate-400 flex items-center justify-between font-mono pt-2 border-t border-slate-100 dark:border-slate-800">
              <span>Đo đạc từ sự kiện nhận diện khuôn mặt YOLO & relay</span>
              <span>24 giờ qua</span>
            </div>
          </div>

          {/* Block C: Real-Time AI Security Activity Feed (6 of 12 cols) */}
          <div className="lg:col-span-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs p-5 sm:p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={18} className="text-red-500" />
                  <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100">
                    {t('home.recentEvents')}
                  </h3>
                </div>
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              </div>

              <p className="text-xs text-slate-400 dark:text-slate-400 mb-3">
                {t('home.recentEventsDesc')}
              </p>

              {/* Event list */}
              <div className="space-y-2 max-h-[260px] overflow-y-auto custom-scrollbar pr-1">
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

            <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => navigate('/playback')}
                className="w-full py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Video size={13} />
                <span>{t('home.viewAllEvents')}</span>
              </button>
            </div>
          </div>

        </div>

        {/* ── Section 5: Admin Quick Operations Hub (Full Width Ribbon) ──── */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs p-5 sm:p-6">
          <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100 mb-3.5 flex items-center gap-2">
            <Sliders size={16} className="text-orange-500" />
            {t('home.quickActions')}
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <button
              onClick={() => navigate('/devices')}
              className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 hover:bg-orange-50 dark:hover:bg-orange-950/30 border border-slate-200/80 dark:border-slate-800 hover:border-orange-200 dark:hover:border-orange-800/60 transition-all text-left group cursor-pointer"
            >
              <div className="w-8 h-8 rounded-xl bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 flex items-center justify-center mb-2.5 group-hover:scale-110 transition-transform">
                <Plus size={16} />
              </div>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block truncate">
                {t('home.actionAddCamera')}
              </span>
            </button>

            <button
              onClick={() => navigate('/members')}
              className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 border border-slate-200/80 dark:border-slate-800 hover:border-emerald-200 dark:hover:border-emerald-800/60 transition-all text-left group cursor-pointer"
            >
              <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-2.5 group-hover:scale-110 transition-transform">
                <Users size={16} />
              </div>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block truncate">
                {t('home.actionManageMembers')}
              </span>
            </button>

            <button
              onClick={() => navigate('/recorder')}
              className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 hover:bg-blue-50 dark:hover:bg-blue-950/30 border border-slate-200/80 dark:border-slate-800 hover:border-blue-200 dark:hover:border-blue-800/60 transition-all text-left group cursor-pointer"
            >
              <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-2.5 group-hover:scale-110 transition-transform">
                <HardDrive size={16} />
              </div>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block truncate">
                {t('home.actionNvrSettings')}
              </span>
            </button>

            <button
              onClick={() => navigate('/app-configs')}
              className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 border border-slate-200/80 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-800/60 transition-all text-left group cursor-pointer"
            >
              <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-2.5 group-hover:scale-110 transition-transform">
                <FileShield size={16} />
              </div>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block truncate">
                {t('home.actionAppConfigs')}
              </span>
            </button>

            <button
              onClick={() => navigate('/users')}
              className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 hover:bg-purple-50 dark:hover:bg-purple-950/30 border border-slate-200/80 dark:border-slate-800 hover:border-purple-200 dark:hover:border-purple-800/60 transition-all text-left group cursor-pointer"
            >
              <div className="w-8 h-8 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-2.5 group-hover:scale-110 transition-transform">
                <UserCog size={16} />
              </div>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block truncate">
                {t('home.actionManageUsers')}
              </span>
            </button>

            <button
              onClick={() => navigate('/pool')}
              className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 hover:bg-cyan-50 dark:hover:bg-cyan-950/30 border border-slate-200/80 dark:border-slate-800 hover:border-cyan-200 dark:hover:border-cyan-800/60 transition-all text-left group cursor-pointer"
            >
              <div className="w-8 h-8 rounded-xl bg-cyan-100 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400 flex items-center justify-center mb-2.5 group-hover:scale-110 transition-transform">
                <Layers size={16} />
              </div>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block truncate">
                {t('home.actionViewPool')}
              </span>
            </button>
          </div>
        </div>



        </div>
      </PullToRefresh>
    </div>
  );
};

export default Home;
