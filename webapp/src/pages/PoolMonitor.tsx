import { useState, useEffect, useCallback } from 'react';
import {
  Layers,
  Cpu,
  Tv,
  Users,
  Clock,
  Sparkles,
  Info,
  Radio,
} from 'lucide-react';
import { api } from '../api/client';
import type { PoolStatusSummary } from '../types/pool';
import { useTranslation } from '../i18n';
import { useRealtimeEvent } from '@hubsight/realtime/react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

function parsePoolSummary(raw: unknown): PoolStatusSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const root = raw as Record<string, unknown>;
  const inner =
    Array.isArray(root.cameras) || typeof root.total_cameras === 'number'
      ? root
      : root.data && typeof root.data === 'object'
        ? (root.data as Record<string, unknown>)
        : null;
  if (!inner) return null;
  if (inner.cameras !== undefined && !Array.isArray(inner.cameras)) return null;
  return inner as unknown as PoolStatusSummary;
}

export const PoolMonitor = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<PoolStatusSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const hydrateOnce = useCallback(async () => {
    try {
      setData(await api.pool.status());
    } catch (err) {
      console.error('Failed to fetch connection pool status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    hydrateOnce();
  }, [hydrateOnce]);

  useRealtimeEvent('pool.status.update', (raw) => {
    const summary = parsePoolSummary(raw);
    if (!summary) return;
    setData(summary);
    setLoading(false);
  });

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50 p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header Section */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
                <Layers size={24} />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-800 flex items-center gap-2.5">
                  {t('pool.title')}
                  <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Active Pool
                  </span>
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">
                  {t('pool.subtitle')}
                </p>
              </div>
            </div>
          </div>

          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4">
            {/* 1. Total Cameras */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">{t('pool.totalCameras')}</span>
                <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
                  <Radio size={16} />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900">{data?.total_cameras ?? 0}</span>
                <span className="text-[11px] font-bold text-emerald-600">
                  {data?.active_cameras ?? 0} {t('pool.activeCameras').toLowerCase()}
                </span>
              </div>
            </div>

            {/* 2. CV Background Streams */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-emerald-200/70 shadow-xs flex flex-col justify-between bg-gradient-to-b from-white to-emerald-50/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-700">{t('pool.cvStreams')}</span>
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  <Cpu size={16} />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-black text-emerald-900">{data?.total_cv_streams ?? 0}</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 uppercase">
                  24/7 AI
                </span>
              </div>
            </div>

            {/* 3. Live Scaled Streams */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-blue-200/70 shadow-xs flex flex-col justify-between bg-gradient-to-b from-white to-blue-50/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-blue-700">{t('pool.liveStreams')}</span>
                <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                  <Tv size={16} />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-black text-blue-900">{data?.total_live_streams ?? 0}</span>
                <span className="text-[11px] font-bold text-slate-500">
                  {t('pool.liveMuxHint')}
                </span>
              </div>
            </div>

            {/* 4. Active Viewers */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-indigo-200/70 shadow-xs flex flex-col justify-between bg-gradient-to-b from-white to-indigo-50/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-indigo-700">{t('pool.activeViewers')}</span>
                <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                  <Users size={16} />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-black text-indigo-900">{data?.total_active_viewers ?? 0}</span>
                <span className="text-[11px] font-bold text-indigo-600">
                  Real-time
                </span>
              </div>
            </div>

            {/* 5. Auto GC Info */}
            <div className="col-span-2 lg:col-span-1 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">{t('pool.autoCleanup')}</span>
                <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
                  <Clock size={16} />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-xs font-bold text-slate-700">30s Idle Timeout</span>
                <p className="text-[10px] text-slate-400 mt-0.5">{t('pool.closeIdleSocket')}</p>
              </div>
            </div>
          </div>

          {/* Camera Pools Detail List */}
          <div className="space-y-4">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Radio size={18} className="text-orange-600" />
              {t('pool.cameraListTitle')}
            </h2>

            {loading && !data ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2].map((i) => (
                  <div key={i} className="h-64 bg-white rounded-3xl border border-slate-200/80 animate-pulse p-6" />
                ))}
              </div>
            ) : data?.cameras && data.cameras.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {data.cameras.map((cam) => {
                  const liveConns = Object.values(cam.live_pool || {});

                  return (
                    <div
                      key={cam.camera_id}
                      className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden flex flex-col"
                    >
                      {/* Card Top / Header */}
                      <div className="p-4 sm:p-5 border-b border-slate-100 flex items-start justify-between gap-3 bg-slate-50/60">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-base text-slate-900 truncate">
                              {cam.camera_name}
                            </h3>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                cam.is_active
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-200 text-slate-600'
                              }`}
                            >
                              {cam.is_active ? 'Online' : 'Disabled'}
                            </span>
                            {cam.enable_ai && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 flex items-center gap-1">
                                <Sparkles size={10} />
                                AI YOLO & Face
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 font-mono mt-1 truncate" title={cam.host}>
                            {cam.host}
                          </p>
                        </div>
                      </div>

                      {/* Connection #0 (CV Dedicated) */}
                      <div className="p-4 sm:p-5 border-b border-slate-100 bg-emerald-50/30">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            {t('pool.cvSectionTitle')}
                          </span>
                          <span className="text-[10px] font-bold bg-emerald-600 text-white px-2 py-0.5 rounded-full">
                            Stream #0
                          </span>
                        </div>

                        {cam.cv_connection ? (
                          <div className="p-3 rounded-2xl bg-white border border-emerald-200/80 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                            <div className="min-w-0">
                              <span className="text-xs font-mono font-bold text-slate-800 truncate block">
                                {cam.cv_connection.stream_name}
                              </span>
                              <span className="text-[11px] text-slate-500 mt-0.5 block">
                                {t('pool.cvDedicatedHint')}
                              </span>
                            </div>
                            <span className="shrink-0 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200 self-start sm:self-center">
                              {t('pool.cvRunningBadge')}
                            </span>
                          </div>
                        ) : (
                          <div className="p-3 rounded-2xl bg-white/60 border border-slate-200 text-xs text-slate-400 text-center">
                            {t('pool.cvIdle')}
                          </div>
                        )}
                      </div>

                      {/* Connection #1 (NVR Dedicated) */}
                      <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/80">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-slate-800">
                            {t('pool.nvrSectionTitle')}
                          </span>
                          <span className="text-[10px] font-bold bg-slate-700 text-white px-2 py-0.5 rounded-full">
                            Stream #1
                          </span>
                        </div>
                        {cam.nvr_connection ? (
                          <div className="p-3 rounded-2xl bg-white border border-slate-200 flex items-center justify-between gap-2">
                            <span className="text-xs font-mono font-bold text-slate-800 truncate">
                              {cam.nvr_connection.stream_name}
                            </span>
                          </div>
                        ) : (
                          <div className="p-3 rounded-2xl bg-white/60 border border-slate-200 text-xs text-slate-400 text-center">
                            {t('pool.nvrIdle')}
                          </div>
                        )}
                      </div>

                      {/* Live Connections Pool */}
                      <div className="p-4 sm:p-5 flex-1 flex flex-col">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                            <Tv size={14} className="text-blue-600" />
                            {t('pool.liveSectionTitle')}
                          </span>
                          <span className="text-[11px] font-semibold text-slate-400">
                            {t('pool.liveStreamCount', { count: liveConns.length })}
                          </span>
                        </div>

                        {liveConns.length > 0 ? (
                          <div className="space-y-2.5">
                            {liveConns.map((conn) => {
                              const max = conn.max_users > 0 ? conn.max_users : 5;
                              const percent = Math.min(100, (conn.active_users / max) * 100);
                              const isFull = conn.active_users >= max;

                              return (
                                <div
                                  key={conn.id}
                                  className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col gap-2"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="text-xs font-bold font-mono text-slate-800 truncate">
                                        {conn.stream_name}
                                      </span>
                                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-800">
                                        Conn #{conn.index}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1 text-xs font-bold shrink-0">
                                      <Users size={12} className="text-slate-500" />
                                      <span className={isFull ? 'text-amber-600' : 'text-slate-700'}>
                                        {conn.active_users} / {max}
                                      </span>
                                      <span className="text-[10px] text-slate-400 font-normal">clients</span>
                                    </div>
                                  </div>

                                  {/* Progress bar */}
                                  <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all duration-300 ${
                                        isFull ? 'bg-amber-500' : 'bg-blue-600'
                                      }`}
                                      style={{ width: `${percent}%` }}
                                    />
                                  </div>

                                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                                    <span>
                                      {conn.status === 'idle'
                                        ? `⚠️ ${t('pool.connIdleReclaim')}`
                                        : `🟢 ${t('pool.connServing')}`}
                                    </span>
                                    <span>{t('pool.lastActive', { time: dayjs(conn.last_used_at).fromNow() })}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="flex-1 min-h-[90px] rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center p-4 text-center text-slate-400">
                            <Tv size={20} className="text-slate-300 mb-1" />
                            <p className="text-xs leading-relaxed max-w-sm">
                              {t('pool.noLiveStreams')}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-white p-12 rounded-3xl border border-slate-200 text-center text-slate-400">
                {t('noData')}
              </div>
            )}
          </div>

          {/* Connection rules */}
          <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
                <Info size={16} />
              </div>
              <h3 className="font-semibold text-sm sm:text-base text-slate-800">
                {t('pool.policyTitle')}
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <span className="w-5 h-5 rounded-md bg-white border border-slate-200 text-slate-600 flex items-center justify-center text-[11px] font-bold">
                    1
                  </span>
                  {t('pool.policy1Title')}
                </div>
                <p className="text-xs leading-relaxed text-slate-600">{t('pool.policy1')}</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <span className="w-5 h-5 rounded-md bg-white border border-slate-200 text-slate-600 flex items-center justify-center text-[11px] font-bold">
                    2
                  </span>
                  {t('pool.policy2Title')}
                </div>
                <p className="text-xs leading-relaxed text-slate-600">{t('pool.policy2')}</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <span className="w-5 h-5 rounded-md bg-white border border-slate-200 text-slate-600 flex items-center justify-center text-[11px] font-bold">
                    3
                  </span>
                  {t('pool.policy3Title')}
                </div>
                <p className="text-xs leading-relaxed text-slate-600">{t('pool.policy3')}</p>
              </div>
            </div>
          </div>
        </div>
    </div>
  );
};
