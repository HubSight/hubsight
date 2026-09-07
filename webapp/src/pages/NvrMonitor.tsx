import { useState, useEffect } from 'react';
import {
  Activity,
  Server,
  HardDrive,
  Cpu,
  RefreshCw,
  Clock,
  Video,
  Database,
  Radio,
  Trash2,
  Zap
} from 'lucide-react';
import { api } from '../api/client';
import type { NvrStatusResponse } from '../types/nvr';
import { useTranslation } from '../i18n';
import { useOnNvrStatus } from '@hubsight/realtime/react';
import { NvrMonitorSkeleton } from '../components/common/Skeleton';
import { PullToRefresh } from '../components/common/PullToRefresh';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatUptime = (seconds: number) => {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
};

const NvrMonitor = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<NvrStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    type: 'confirm' | 'prompt' | 'alert';
    title: string;
    message: string;
    inputValue: string;
    onConfirm: (val?: string) => void;
  }>({
    isOpen: false,
    type: 'alert',
    title: '',
    message: '',
    inputValue: '',
    onConfirm: () => { },
  });

  const toggleNvrStatus = async (currentStatus: boolean) => {
    const nextStatus = !currentStatus;
    setModalConfig({
      isOpen: true,
      type: 'confirm',
      title: nextStatus ? t('nvr.startEngine') : t('nvr.stopEngine'),
      message: nextStatus
        ? 'Are you sure you want to enable the global NVR recorder engine?'
        : 'Are you sure you want to pause all background camera recording pipelines?',
      inputValue: '',
      onConfirm: async () => {
        setIsUpdatingSettings(true);
        try {
          await api.recorder.updateSettings({ nvr_status: nextStatus });
          await fetchStatus(false);
        } catch (err) {
          console.error('Failed to update NVR status', err);
        } finally {
          setIsUpdatingSettings(false);
        }
      }
    });
  };

  const promptUpdateQuota = (currentQuotaBytes: number) => {
    const currentGb = Math.round(currentQuotaBytes / (1024 * 1024 * 1024));
    setModalConfig({
      isOpen: true,
      type: 'prompt',
      title: t('nvr.editQuotaTitle'),
      message: t('nvr.editQuotaMessage'),
      inputValue: currentGb.toString(),
      onConfirm: async (val) => {
        const newQuota = parseInt(val || '', 10);
        if (isNaN(newQuota) || newQuota <= 0) {
          setTimeout(() => setModalConfig({ isOpen: true, type: 'alert', title: t('error'), message: t('nvr.invalidQuota'), inputValue: '', onConfirm: () => { } }), 100);
          return;
        }

        setIsUpdatingSettings(true);
        try {
          await api.recorder.updateSettings({ storage_quota_gb: newQuota });
          await fetchStatus(false);
        } catch (err) {
          console.error('Failed to update quota', err);
          setTimeout(() => setModalConfig({ isOpen: true, type: 'alert', title: t('error'), message: t('nvr.failedUpdateQuota'), inputValue: '', onConfirm: () => { } }), 100);
        } finally {
          setIsUpdatingSettings(false);
        }
      }
    });
  };

  const promptUpdateRetention = (currentRetentionDays: number) => {
    setModalConfig({
      isOpen: true,
      type: 'prompt',
      title: t('nvr.editRetentionTitle'),
      message: t('nvr.editRetentionMessage'),
      inputValue: currentRetentionDays.toString(),
      onConfirm: async (val) => {
        const newDays = parseInt(val || '', 10);
        if (isNaN(newDays) || newDays <= 0) {
          setTimeout(() => setModalConfig({ isOpen: true, type: 'alert', title: t('error'), message: t('nvr.invalidRetention'), inputValue: '', onConfirm: () => { } }), 100);
          return;
        }

        setIsUpdatingSettings(true);
        try {
          await api.recorder.updateSettings({ retention_days: newDays });
          await fetchStatus(false);
        } catch (err) {
          console.error('Failed to update retention', err);
          setTimeout(() => setModalConfig({ isOpen: true, type: 'alert', title: t('error'), message: t('nvr.failedUpdateRetention'), inputValue: '', onConfirm: () => { } }), 100);
        } finally {
          setIsUpdatingSettings(false);
        }
      }
    });
  };

  const handleCleanupStorage = () => {
    setModalConfig({
      isOpen: true,
      title: t('nvr.formatTitle'),
      message: t('nvr.formatMessage'),
      type: 'confirm',
      inputValue: '',
      onConfirm: async () => {
        setIsUpdatingSettings(true);
        try {
          const result = await api.recorder.storageCleanup();
          const freedGb = (result.freed_bytes / (1024 * 1024 * 1024)).toFixed(2);

          setModalConfig({
            isOpen: true,
            title: t('nvr.formatCompleteTitle'),
            message: t('nvr.formatSuccess', { count: result.deleted_count, size: freedGb }),
            type: 'alert',
            inputValue: '',
            onConfirm: () => {
              setModalConfig({ isOpen: false, type: 'alert', title: '', message: '', inputValue: '', onConfirm: () => { } });
              fetchStatus(true);
            },
          });
        } catch (error) {
          console.error('Failed to cleanup storage:', error);
          setModalConfig({
            isOpen: true,
            title: t('error'),
            message: t('nvr.formatFailed'),
            type: 'alert',
            inputValue: '',
            onConfirm: () => setModalConfig({ isOpen: false, type: 'alert', title: '', message: '', inputValue: '', onConfirm: () => { } }),
          });
        } finally {
          setIsUpdatingSettings(false);
        }
      },
    });
  };

  const fetchStatus = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setIsRefreshing(true);
    try {
      setData(await api.recorder.status());
    } catch (err) {
      console.error('Failed to fetch NVR status', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  // Initial fetch on mount
  useEffect(() => {
    fetchStatus(true);
  }, []);

  // Real-time Event-Driven updates via RabbitMQ -> Socket.IO (0 HTTP requests)
  useOnNvrStatus((newStatus) => {
    setData(newStatus);
    setLoading(false);
    setIsRefreshing(false);
  });

  if (loading && !data) {
    return (
      <div className="p-4 md:p-8 h-full flex flex-col overflow-y-auto">
        <NvrMonitorSkeleton />
      </div>
    );
  }

  const recordingCamsCount = data?.cameras.filter((c) => c.status === 'recording').length || 0;
  const totalCamsCount = data?.cameras.length || 0;

  return (
    <PullToRefresh onRefresh={() => fetchStatus(false)} className="p-4 md:p-8 h-full flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 md:mb-8 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold mb-2 flex items-center gap-3 text-slate-800">
            <Activity className="text-orange-600" size={32} />
            {t('nvr.title')}
          </h1>
          <p className="text-slate-500 text-sm md:text-base">
            {t('nvr.subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          {/* Real-time WebSocket Live Status Badge */}
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-2 rounded-xl border border-emerald-200/80 select-none">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="flex items-center gap-1">
              <Zap size={13} className="text-emerald-600" />
              {t('nvr.realtimeLive')}
            </span>
          </div>

          <button
            onClick={() => fetchStatus(false)}
            disabled={isRefreshing}
            className="btn btn-secondary flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl cursor-pointer"
            title={t('refresh')}
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin text-orange-600' : ''} />
            <span>{t('refresh')}</span>
          </button>
        </div>
      </div>

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 md:mb-8">

        {/* Card 1: Service Status */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('nvr.engineStatus')}
            </span>
            <div className="flex gap-2 items-center">
              <button
                onClick={() => toggleNvrStatus(!!data?.is_global_enabled)}
                disabled={isUpdatingSettings || !data}
                className={`text-xs px-3 py-1.5 font-semibold rounded-md transition-colors cursor-pointer ${data?.is_global_enabled
                  ? 'bg-red-50 text-red-600 hover:bg-red-100'
                  : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                  }`}
              >
                {data?.is_global_enabled ? t('nvr.stopEngine') : t('nvr.startEngine')}
              </button>
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                <Server size={20} />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 mb-1">
            <span className={`w-2.5 h-2.5 rounded-full animate-pulse ${data?.is_global_enabled ? 'bg-emerald-500' : 'bg-red-500'}`} />
            <h3 className="text-xl font-bold text-slate-800 uppercase tracking-wide">
              {data?.is_global_enabled ? (data?.status || t('nvr.healthy')) : t('nvr.disabled')}
            </h3>
          </div>
          <p className="text-xs text-slate-500 flex items-center gap-1 mt-2">
            <Clock size={14} className="text-slate-400" />
            {t('nvr.uptime')}: {data ? formatUptime(data.system.uptime_seconds) : '0s'}
          </p>
        </div>

        {/* Card 2: Recording Pipeline */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('nvr.recordingDevices')}
            </span>
            <div className="p-2 bg-orange-50 text-orange-600 rounded-lg">
              <Video size={20} />
            </div>
          </div>
          <div className="flex items-baseline gap-2 mb-1">
            <h3 className="text-2xl font-bold text-slate-800">
              {recordingCamsCount}
              <span className="text-sm font-medium text-slate-400"> / {totalCamsCount} {t('nvr.active')}</span>
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
            <Radio size={14} className="text-orange-500" />
            {t('nvr.liveStreamsActive')}: {data?.active_live_streams_count || 0}
          </p>
        </div>

        {/* Card 3: Storage Quota & Retention Policy */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3 gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('nvr.storageTitle')}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={handleCleanupStorage}
                disabled={isUpdatingSettings || !data}
                className="text-xs px-2.5 py-1 font-semibold bg-red-50 text-red-600 rounded-lg hover:bg-red-100 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
              >
                {t('nvr.format')}
              </button>
              <button
                onClick={() => promptUpdateQuota(data?.storage.quota_bytes || 0)}
                disabled={isUpdatingSettings || !data}
                className="text-xs px-2.5 py-1 font-semibold bg-orange-50 text-orange-600 rounded-lg hover:bg-orange-100 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
              >
                {t('nvr.editLimit')}
              </button>
              <div className="p-2 bg-purple-50 text-purple-600 rounded-lg shrink-0">
                <HardDrive size={18} />
              </div>
            </div>
          </div>
          <div className="flex items-baseline gap-2 mb-2">
            <h3 className="text-xl font-bold text-slate-800">
              {data ? formatBytes(data.storage.used_bytes) : '0 B'}
            </h3>
            <span className="text-xs text-slate-400">
              / {data ? formatBytes(data.storage.quota_bytes) : '47 GB'}
            </span>
          </div>
          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mb-1">
            <div
              className={`h-full transition-all duration-500 ${(data?.storage.used_percentage || 0) > 90
                ? 'bg-red-500'
                : (data?.storage.used_percentage || 0) > 75
                  ? 'bg-amber-500'
                  : 'bg-blue-600'
                }`}
              style={{ width: `${Math.min(data?.storage.used_percentage || 0, 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium mt-1.5">
            <span>{(data?.storage.used_percentage || 0).toFixed(1)}% {t('nvr.used')}</span>
            <span className="flex items-center gap-1 text-emerald-600 font-semibold cursor-pointer hover:text-emerald-700 transition-colors" onClick={() => promptUpdateRetention(data?.storage.retention_days || 4)}>
              <Trash2 size={11} /> {data?.storage.retention_days || 4} {t('nvr.retentionDays')} ({t('edit')})
            </span>
          </div>
        </div>

        {/* Card 4: System Resources */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('nvr.systemResources')}
            </span>
            <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
              <Cpu size={20} />
            </div>
          </div>
          <div className="flex items-baseline gap-2 mb-1">
            <h3 className="text-xl font-bold text-slate-800">
              {data?.system.memory_alloc_mb.toFixed(1)} MB
            </h3>
            <span className="text-xs text-slate-400">{t('nvr.memoryUsage')}</span>
          </div>
          <p className="text-xs text-slate-500 mt-2 flex items-center justify-between">
            <span>{t('nvr.goroutines', { count: data?.system.goroutines || 0 })}</span>
            <span>{t('nvr.cpuCores', { count: data?.system.num_cpu || 1 })}</span>
          </p>
        </div>
      </div>

      {/* Camera Pipeline Detail Cards */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden mb-6">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Database size={18} className="text-orange-600" />
              {t('nvr.cameraDetails')}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {t('nvr.cameraDetailsSubtitle')}
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg">
            {t('nvr.totalPipelines', { count: totalCamsCount })}
          </span>
        </div>

        {data?.cameras.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            {t('noData')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/30 text-xs font-semibold text-slate-500">
                  <th className="py-3.5 px-5">{t('nvr.camera')}</th>
                  <th className="py-3.5 px-4">{t('nvr.status')}</th>
                  <th className="py-3.5 px-4">{t('nvr.streamPipeline')}</th>
                  <th className="py-3.5 px-4">{t('nvr.segmentLength')}</th>
                  <th className="py-3.5 px-4">{t('nvr.latestSegment')}</th>
                  <th className="py-3.5 px-4">{t('nvr.totalSegments')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.cameras.map((cam) => (
                  <tr key={cam.camera_id} className="hover:bg-slate-50/60 transition-colors">

                    {/* Device Info */}
                    <td className="py-4 px-5">
                      <div className="font-semibold text-slate-800">{cam.name}</div>
                      <div className="text-xs text-slate-400 font-mono break-all max-w-xs truncate">
                        {cam.host}
                      </div>
                    </td>

                    {/* Status Badge */}
                    <td className="py-4 px-4">
                      {cam.status === 'recording' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          {t('nvr.recording').toUpperCase()}
                        </span>
                      ) : cam.status === 'stalled' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                          {t('nvr.noSignal')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                          <span className="w-2 h-2 rounded-full bg-slate-400" />
                          {t('nvr.disabled').toUpperCase()}
                        </span>
                      )}
                    </td>

                    {/* Stream Pipeline Settings */}
                    <td className="py-4 px-4 text-xs">
                      <div className="flex flex-wrap gap-1">
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                          {cam.video_codec === 'copy' ? t('devices.copyCpu') : cam.video_codec}
                        </span>
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                          {cam.audio_mode === 'disabled' || cam.audio_mode === 'mute'
                            ? t('nvr.audioDisabled')
                            : cam.audio_mode === 'auto'
                              ? t('nvr.audioAuto')
                              : cam.audio_mode === 'copy'
                                ? t('nvr.audioCopy')
                                : cam.audio_mode === 'aac'
                                  ? t('nvr.audioAac')
                                  : t('nvr.audioOther', { mode: cam.audio_mode })}
                        </span>
                      </div>
                    </td>

                    {/* Segment Length */}
                    <td className="py-4 px-4 text-xs font-medium text-slate-700">
                      {t('nvr.mins', { minutes: Math.round(cam.segment_duration / 60), seconds: cam.segment_duration })}
                    </td>

                    {/* Latest S3 Segment */}
                    <td className="py-4 px-4 text-xs">
                      {cam.latest_segment_at ? (
                        <div>
                          <div className="font-semibold text-slate-800">
                            {dayjs(cam.latest_segment_at).fromNow()}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {formatBytes(cam.latest_segment_size || 0)} •{' '}
                            {dayjs(cam.latest_segment_at).format('HH:mm:ss')}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">{t('nvr.noSegments')}</span>
                      )}
                    </td>

                    {/* Total Segments */}
                    <td className="py-4 px-4 text-xs font-semibold text-slate-800">
                      {cam.total_segments.toLocaleString()} {t('nvr.files')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Premium Custom Modal */}
      {modalConfig.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <h3 className="text-lg font-bold text-slate-800 mb-2">{modalConfig.title}</h3>
              <p className="text-sm text-slate-600 mb-5">{modalConfig.message}</p>

              {modalConfig.type === 'prompt' && (
                <div className="mb-2">
                  <input
                    type="number"
                    autoFocus
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                    value={modalConfig.inputValue}
                    onChange={(e) => setModalConfig({ ...modalConfig, inputValue: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        modalConfig.onConfirm(modalConfig.inputValue);
                        setModalConfig({ ...modalConfig, isOpen: false });
                      }
                    }}
                  />
                </div>
              )}
            </div>

            <div className="bg-slate-50 px-6 py-4 flex items-center justify-end gap-3 border-t border-slate-100">
              {modalConfig.type !== 'alert' && (
                <button
                  onClick={() => setModalConfig({ ...modalConfig, isOpen: false })}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/50 rounded-lg transition-colors cursor-pointer"
                >
                  {t('cancel')}
                </button>
              )}
              <button
                onClick={() => {
                  modalConfig.onConfirm(modalConfig.inputValue);
                  setModalConfig({ ...modalConfig, isOpen: false });
                }}
                className={`px-4 py-2 text-sm font-semibold text-white rounded-lg transition-colors shadow-sm cursor-pointer ${modalConfig.type === 'confirm' ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
              >
                {modalConfig.type === 'alert' ? t('ok') : t('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </PullToRefresh>
  );
};

export default NvrMonitor;
