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
  Trash2
} from 'lucide-react';
import axiosClient from '../api/axiosClient';
import type { NvrStatusResponse } from '../types/nvr';
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
  const [data, setData] = useState<NvrStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchStatus = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setIsRefreshing(true);
    try {
      const res = await axiosClient.get('/recorder/status');
      setData(res.data);
    } catch (err) {
      console.error('Failed to fetch NVR status', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStatus(true);
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchStatus(false);
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  if (loading && !data) {
    return (
      <div className="p-8 flex items-center justify-center h-full text-slate-400">
        <RefreshCw className="animate-spin text-orange-500 mr-2" size={24} />
        Loading NVR Status...
      </div>
    );
  }

  const recordingCamsCount = data?.cameras.filter((c) => c.status === 'recording').length || 0;
  const totalCamsCount = data?.cameras.length || 0;

  return (
    <div className="p-4 md:p-8 h-full flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 md:mb-8 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold mb-2 flex items-center gap-3 text-slate-800">
            <Activity className="text-orange-600" size={32} />
            NVR Recorder Service Monitor
          </h1>
          <p className="text-slate-500 text-sm md:text-base">
            Real-time pipeline diagnostics, camera recording states, S3 quota & server metrics.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer select-none bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-2xs">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="accent-orange-600 rounded"
            />
            Auto-refresh (5s)
          </label>
          <button
            onClick={() => fetchStatus(false)}
            disabled={isRefreshing}
            className="btn btn-secondary flex items-center gap-2 text-sm shadow-2xs"
            title="Refresh now"
          >
            <RefreshCw size={16} className={isRefreshing ? 'animate-spin text-orange-600' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 md:mb-8">
        
        {/* Card 1: Service Status */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              NVR Engine Status
            </span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <Server size={20} />
            </div>
          </div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h3 className="text-xl font-bold text-slate-800 uppercase tracking-wide">
              {data?.status || 'HEALTHY'}
            </h3>
          </div>
          <p className="text-xs text-slate-500 flex items-center gap-1 mt-2">
            <Clock size={14} className="text-slate-400" />
            Uptime: {data ? formatUptime(data.system.uptime_seconds) : '0s'}
          </p>
        </div>

        {/* Card 2: Recording Pipeline */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Recording Devices
            </span>
            <div className="p-2 bg-orange-50 text-orange-600 rounded-lg">
              <Video size={20} />
            </div>
          </div>
          <div className="flex items-baseline gap-2 mb-1">
            <h3 className="text-2xl font-bold text-slate-800">
              {recordingCamsCount}
              <span className="text-sm font-medium text-slate-400"> / {totalCamsCount} Active</span>
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
            <Radio size={14} className="text-orange-500" />
            Live Streams Active: {data?.active_live_streams_count || 0}
          </p>
        </div>

        {/* Card 3: Storage Quota & Retention Policy */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              S3 Storage & Retention
            </span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <HardDrive size={20} />
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
              className={`h-full transition-all duration-500 ${
                (data?.storage.used_percentage || 0) > 90
                  ? 'bg-red-500'
                  : (data?.storage.used_percentage || 0) > 75
                  ? 'bg-amber-500'
                  : 'bg-blue-600'
              }`}
              style={{ width: `${Math.min(data?.storage.used_percentage || 0, 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium mt-1.5">
            <span>{(data?.storage.used_percentage || 0).toFixed(1)}% Used</span>
            <span className="flex items-center gap-1 text-emerald-600 font-semibold">
              <Trash2 size={11} /> 6-Day TTL (Every 7d)
            </span>
          </div>
        </div>

        {/* Card 4: System Resources */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Server Resources
            </span>
            <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
              <Cpu size={20} />
            </div>
          </div>
          <div className="flex items-baseline gap-2 mb-1">
            <h3 className="text-xl font-bold text-slate-800">
              {data?.system.memory_alloc_mb.toFixed(1)} MB
            </h3>
            <span className="text-xs text-slate-400">RAM Allocated</span>
          </div>
          <p className="text-xs text-slate-500 mt-2 flex items-center justify-between">
            <span>Goroutines: {data?.system.goroutines || 0}</span>
            <span>{data?.system.num_cpu || 1} CPU Cores</span>
          </p>
        </div>
      </div>

      {/* Camera Pipeline Detail Cards */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden mb-6">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Database size={18} className="text-orange-600" />
              Device Recording Pipelines
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Live ingest health, latest video segment saved to S3, and stream parameters.
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg">
            Total Pipelines: {totalCamsCount}
          </span>
        </div>

        {data?.cameras.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            No devices configured. Go to Devices tab to add a device.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/30 text-xs font-semibold text-slate-500">
                  <th className="py-3.5 px-5">Device</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Stream Pipeline</th>
                  <th className="py-3.5 px-4">Segment Length</th>
                  <th className="py-3.5 px-4">Latest S3 Segment</th>
                  <th className="py-3.5 px-4">Total Segments</th>
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
                          RECORDING
                        </span>
                      ) : cam.status === 'stalled' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                          NO SIGNAL / STALLED
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                          <span className="w-2 h-2 rounded-full bg-slate-400" />
                          DISABLED
                        </span>
                      )}
                    </td>

                    {/* Stream Pipeline Settings */}
                    <td className="py-4 px-4 text-xs">
                      <div className="flex flex-wrap gap-1">
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono">
                          {cam.rtsp_transport.toUpperCase()}
                        </span>
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                          {cam.video_codec === 'copy' ? '0% CPU Copy' : cam.video_codec}
                        </span>
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                          Audio: {cam.audio_mode}
                        </span>
                      </div>
                    </td>

                    {/* Segment Length */}
                    <td className="py-4 px-4 text-xs font-medium text-slate-700">
                      {cam.segment_duration / 60} mins ({cam.segment_duration}s)
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
                        <span className="text-slate-400 italic">No segments recorded yet</span>
                      )}
                    </td>

                    {/* Total Segments */}
                    <td className="py-4 px-4 text-xs font-semibold text-slate-800">
                      {cam.total_segments.toLocaleString()} files
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default NvrMonitor;
