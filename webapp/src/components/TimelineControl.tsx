import React, { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import {
  Play,
  Radio,
  ShieldAlert,
  Flame,
  UserX,
  Activity,
  Calendar,
  Sparkles,
  ChevronDown,
  ChevronUp,
  HardDrive,
  ShieldCheck
} from 'lucide-react';
import type { Recording } from '../types/recording';
import { api } from '../api/client';
import { useTranslation } from '../i18n';

interface TimelineControlProps {
  recordings: Recording[];
  currentDate: string; // YYYY-MM-DD
  activeRecording?: Recording | null;
  mode?: 'live' | 'archive';
  liveOffline?: boolean;
  onSeek: (recording: Recording, offsetSeconds: number) => void;
  onGoLive?: () => void;
}

type EventCategory = 'all' | 'morning' | 'afternoon' | 'evening';

// Helper to determine event badge & icon from recording metadata
function getEventMetadata(rec: Recording, t: any) {
  const path = (rec.file_path || '').toLowerCase();
  
  if (path.includes('fire') || path.includes('smoke') || path.includes('danger') || path.includes('weapon')) {
    return {
      type: 'danger',
      label: t('timeline.eventDanger'),
      color: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      markerColor: 'bg-rose-500 shadow-rose-500/50',
      icon: Flame
    };
  }
  
  if (path.includes('fall') || path.includes('collapse') || path.includes('anomaly')) {
    return {
      type: 'fall',
      label: t('timeline.eventFall'),
      color: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      markerColor: 'bg-amber-400 shadow-amber-400/50',
      icon: Activity
    };
  }
  
  if (path.includes('stranger')) {
    return {
      type: 'stranger',
      label: t('timeline.eventStranger'),
      color: 'bg-red-500/20 text-red-300 border-red-500/40',
      markerColor: 'bg-red-500 shadow-red-500/50',
      icon: UserX
    };
  }

  // Default AI Event
  return {
    type: 'motion',
    label: t('timeline.eventMotion'),
    color: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
    markerColor: 'bg-orange-500 shadow-orange-500/50',
    icon: ShieldAlert
  };
}

const TimelineControl: React.FC<TimelineControlProps> = ({
  recordings,
  currentDate,
  activeRecording,
  mode = 'live',
  liveOffline = false,
  onSeek,
  onGoLive
}) => {
  const { t } = useTranslation();
  const [filterPeriod, setFilterPeriod] = useState<EventCategory>('all');
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [hoveredRec, setHoveredRec] = useState<Recording | null>(null);

  // Parse and sort recordings chronologically
  const sortedRecordings = useMemo(() => {
    return [...recordings].sort((a, b) => {
      return new Date(a.start_at).getTime() - new Date(b.start_at).getTime();
    });
  }, [recordings]);

  // Filter recordings by time of day
  const filteredRecordings = useMemo(() => {
    return sortedRecordings.filter((rec) => {
      if (filterPeriod === 'all') return true;
      const hour = dayjs(rec.start_at).hour();
      if (filterPeriod === 'morning') return hour >= 0 && hour < 12;
      if (filterPeriod === 'afternoon') return hour >= 12 && hour < 18;
      if (filterPeriod === 'evening') return hour >= 18 && hour < 24;
      return true;
    });
  }, [sortedRecordings, filterPeriod]);

  // Format file size
  const formatSize = (bytes: number) => {
    if (!bytes || bytes === 0) return '';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 lg:p-5 shadow-xl flex flex-col gap-4 text-slate-100">
      {/* 1. Header Bar: Title, Count, Filters, Live Button */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-orange-500/20 to-amber-500/10 text-orange-400 rounded-xl border border-orange-500/30 shadow-inner">
            <Sparkles size={20} className="animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm sm:text-base tracking-tight text-white">
                {t('timeline.title')}
              </span>
              <span className="flex items-center gap-1 text-xs bg-slate-800 text-slate-300 font-mono px-2.5 py-0.5 rounded-full border border-slate-700 shadow-sm">
                <Calendar size={11} className="text-orange-400" />
                {currentDate}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
              {recordings.length > 0 ? (
                <span>
                  <strong className="text-emerald-400 font-bold">{recordings.length}</strong>{' '}
                  {t('timeline.hasRecordings').replace('{available}', '')}
                </span>
              ) : (
                <span className="text-amber-400 font-medium">{t('timeline.noRecordingsDate')}</span>
              )}
            </p>
          </div>
        </div>

        {/* Action Controls: Period Filters & Live Toggle */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Period Filter Buttons */}
          <div className="flex items-center bg-slate-950/70 rounded-xl p-1 border border-slate-800 shadow-inner">
            {(['all', 'morning', 'afternoon', 'evening'] as EventCategory[]).map((period) => {
              const labelMap: Record<EventCategory, string> = {
                all: t('timeline.filterAll').replace('{count}', recordings.length.toString()),
                morning: '00-12h',
                afternoon: '12-18h',
                evening: '18-24h'
              };
              const isSelected = filterPeriod === period;
              return (
                <button
                  key={period}
                  onClick={() => setFilterPeriod(period)}
                  className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-slate-800 text-orange-400 shadow-sm border border-slate-700 font-semibold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                  }`}
                >
                  {labelMap[period]}
                </button>
              );
            })}
          </div>

          <div className="flex items-center bg-slate-950/70 rounded-xl p-1 border border-slate-800 shadow-inner">
            {onGoLive && (
              <button
                onClick={onGoLive}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg font-medium transition-all cursor-pointer ${
                  mode === 'live' && !liveOffline
                    ? 'bg-slate-800 text-orange-400 shadow-sm border border-slate-700 font-semibold'
                    : liveOffline
                    ? 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
                title={liveOffline ? t('playback.liveOfflineTitle') : t('timeline.watchLive')}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    mode === 'live' && !liveOffline
                      ? 'bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.8)]'
                      : 'bg-slate-500'
                  }`}
                />
                <Radio
                  size={12}
                  className={mode === 'live' && !liveOffline ? 'text-orange-400' : 'text-slate-500'}
                />
                <span>{t('timeline.live')}</span>
              </button>
            )}
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 rounded-lg transition-colors cursor-pointer"
              title={isCollapsed ? t('timeline.expand') : t('timeline.collapse')}
            >
              {isCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
            </button>
          </div>
        </div>
      </div>

      {!isCollapsed && (
        <>
          {/* 2. Visual 24-Hour Event Density Timeline Bar */}
          <div className="flex flex-col gap-1.5 pt-1">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 px-1">
              <span>00:00</span>
              <span>03:00</span>
              <span>06:00</span>
              <span>09:00</span>
              <span>12:00</span>
              <span>15:00</span>
              <span>18:00</span>
              <span>21:00</span>
              <span>24:00</span>
            </div>

            {/* Timeline Track */}
            <div className="relative w-full h-8 bg-slate-950/80 rounded-xl border border-slate-800/90 overflow-hidden shadow-inner flex items-center px-1">
              {/* Hour Grid Markers (Subtle vertical lines) */}
              {[...Array(24)].map((_, i) => (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 border-r border-slate-800/40 pointer-events-none"
                  style={{ left: `${(i / 24) * 100}%` }}
                />
              ))}

              {/* Event Markers / Pins on the 24h Bar */}
              {sortedRecordings.map((rec) => {
                const start = dayjs(rec.start_at);
                const secondsInDay = start.hour() * 3600 + start.minute() * 60 + start.second();
                const posPercent = Math.min(99.2, Math.max(0.8, (secondsInDay / 86400) * 100));
                const isSelected = mode === 'archive' && activeRecording?.id === rec.id;
                const meta = getEventMetadata(rec, t);

                return (
                  <button
                    key={rec.id}
                    onClick={() => onSeek(rec, 0)}
                    onMouseEnter={() => setHoveredRec(rec)}
                    onMouseLeave={() => setHoveredRec(null)}
                    title={`${start.format('HH:mm:ss')} - ${meta.label} (${rec.duration_seconds || 30}s)`}
                    className={`absolute top-1 bottom-1 w-2.5 -ml-1.25 rounded-md transition-all cursor-pointer z-10 hover:scale-125 hover:z-20 ${
                      isSelected
                        ? 'bg-white ring-2 ring-orange-500 shadow-lg scale-110 z-20'
                        : `${meta.markerColor} opacity-85 hover:opacity-100 shadow-md`
                    }`}
                    style={{ left: `${posPercent}%` }}
                  />
                );
              })}

              {/* Tooltip on hover over 24h bar */}
              {hoveredRec && (
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-800 text-slate-100 text-[10px] font-mono px-2 py-0.5 rounded shadow-lg border border-slate-700 pointer-events-none z-30 whitespace-nowrap">
                  {dayjs(hoveredRec.start_at).format('HH:mm:ss')} • {getEventMetadata(hoveredRec, t).label}
                </div>
              )}
            </div>
          </div>

          {/* 3. Event Video Clips Grid */}
          <div className="pt-2">
            {filteredRecordings.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-3 bg-slate-950/40 rounded-xl border border-slate-800/40 shadow-inner">
                <div className="p-4 bg-emerald-500/10 rounded-full">
                  <ShieldCheck size={32} className="text-emerald-500" />
                </div>
                <span className="text-slate-300 font-semibold text-sm">{t('timeline.allSafe')}</span>
                <p className="text-[11px] text-slate-500 max-w-sm">
                  {t('timeline.noSecurityEvents')}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                {filteredRecordings.map((rec) => {
                  const isSelected = mode === 'archive' && activeRecording?.id === rec.id;
                  const start = dayjs(rec.start_at);
                  const end = dayjs(rec.end_at);
                  const meta = getEventMetadata(rec, t);
                  const Icon = meta.icon;
                  const duration = rec.duration_seconds || (rec.end_at ? end.diff(start, 'second') : 30);

                  return (
                    <div
                      key={rec.id}
                      onClick={() => onSeek(rec, 0)}
                      className={`group relative flex flex-col justify-between rounded-xl border overflow-hidden transition-all cursor-pointer select-none active:scale-[0.98] ${
                        isSelected
                          ? 'bg-gradient-to-b from-orange-600/20 to-slate-900 border-orange-500 shadow-xl shadow-orange-500/10 ring-2 ring-orange-500/40'
                          : 'bg-slate-950/70 hover:bg-slate-900 border-slate-800 hover:border-slate-700 shadow-md'
                      }`}
                    >
                      {/* Thumbnail Container (16:9) */}
                      <div className="relative aspect-video w-full bg-slate-950 overflow-hidden flex items-center justify-center">
                        {rec.thumbnail_path && (
                          <img
                            src={api.archive.thumbnailUrl(rec.id)}
                            alt={meta.label}
                            onError={(e) => {
                              // If thumbnail not found or failed, hide img and show fallback icon
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        )}

                        {/* Fallback Icon overlay when image is not present or loading */}
                        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 -z-10 pointer-events-none">
                          <Icon size={24} className="text-slate-700 opacity-60 group-hover:scale-110 transition-transform" />
                        </div>

                        {/* Top Gradient & Badges */}
                        <div className="absolute inset-x-0 top-0 p-2 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm border backdrop-blur-md flex items-center gap-1 ${meta.color}`}>
                            <Icon size={10} />
                            <span>{meta.label}</span>
                          </span>
                          <span className="text-[10px] font-mono font-bold text-white bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded shadow">
                            {start.format('HH:mm:ss')}
                          </span>
                        </div>

                        {/* Bottom Duration Badge */}
                        <div className="absolute bottom-1.5 right-1.5 bg-black/75 backdrop-blur-sm text-slate-200 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shadow">
                          {duration}s
                        </div>

                        {/* Center Hover Play Icon */}
                        <div className={`absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px] transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                          <div className="p-2 rounded-full bg-orange-500 text-white shadow-lg transform group-hover:scale-110 transition-transform">
                            <Play size={14} className="fill-white translate-x-0.5" />
                          </div>
                        </div>
                      </div>

                      {/* Card Bottom Details */}
                      <div className="p-2.5 flex items-center justify-between text-[11px] font-mono border-t border-slate-800/80 bg-slate-950/40">
                        <span className={`font-semibold tracking-tight ${isSelected ? 'text-orange-400' : 'text-slate-400 group-hover:text-slate-200'}`}>
                          {isSelected ? t('timeline.playing') : t('timeline.ready')}
                        </span>
                        {rec.size_bytes > 0 && (
                          <span className="text-[10px] text-slate-500 flex items-center gap-1">
                            <HardDrive size={10} />
                            {formatSize(rec.size_bytes)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default TimelineControl;

