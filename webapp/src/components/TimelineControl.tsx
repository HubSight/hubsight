import React, { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Clock, Play, Radio, Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react';
import type { Recording } from '../types/recording';
import { useTranslation } from '../i18n';

interface TimelineControlProps {
  recordings: Recording[];
  currentDate: string; // YYYY-MM-DD
  activeRecording?: Recording | null;
  mode?: 'live' | 'archive';
  onSeek: (recording: Recording, offsetSeconds: number) => void;
  onGoLive?: () => void;
}

interface SlotItem {
  index: number;
  label: string; // e.g. "00:00"
  timeRangeLabel: string; // e.g. "00:00 - 00:30"
  slotStartMs: number;
  slotEndMs: number;
  isFuture: boolean;
  hasData: boolean;
  matchingRecording: Recording | null;
  offsetSeconds: number;
  isActive: boolean;
}

const TimelineControl: React.FC<TimelineControlProps> = ({
  recordings,
  currentDate,
  activeRecording,
  mode = 'live',
  onSeek,
  onGoLive
}) => {
  const { t } = useTranslation();
  const [hideEmpty, setHideEmpty] = useState<boolean>(false);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  // Compute 30-minute interval slots from 00:00 to 23:30 (or up to current live time)
  const slots: SlotItem[] = useMemo(() => {
    const now = new Date();
    const isToday = dayjs(currentDate).isSame(dayjs(now), 'day');
    const startOfDay = dayjs(`${currentDate}T00:00:00`);
    
    // 48 intervals of 30 minutes in a full 24-hour day
    const result: SlotItem[] = [];

    for (let i = 0; i < 48; i++) {
      const slotStart = startOfDay.add(i * 30, 'minute');
      const slotEnd = slotStart.add(30, 'minute');
      const slotStartMs = slotStart.valueOf();
      const slotEndMs = slotEnd.valueOf();

      // Check if slot start is strictly in the future compared to current real-time
      const isFuture = isToday && slotStartMs > now.getTime();

      // Find any recording overlapping or containing this 30-minute slot
      // Or whose start_at falls closest within this 30-minute window
      let matchingRecording: Recording | null = null;
      let offsetSeconds = 0;

      for (const rec of recordings) {
        const recStartMs = new Date(rec.start_at).getTime();
        const recEndMs = new Date(rec.end_at).getTime();

        // Check if recording overlaps with this 30-minute slot
        if (recStartMs < slotEndMs && recEndMs > slotStartMs) {
          matchingRecording = rec;
          // Calculate offset in seconds from the start of the recording
          if (slotStartMs > recStartMs) {
            offsetSeconds = Math.max(0, (slotStartMs - recStartMs) / 1000);
          } else {
            offsetSeconds = 0;
          }
          break;
        }
      }

      const hasData = matchingRecording !== null;
      const isActive =
        mode === 'archive' &&
        activeRecording !== null &&
        matchingRecording !== null &&
        activeRecording?.id === matchingRecording.id;

      result.push({
        index: i,
        label: slotStart.format('HH:mm'),
        timeRangeLabel: `${slotStart.format('HH:mm')} - ${slotEnd.format('HH:mm')}`,
        slotStartMs,
        slotEndMs,
        isFuture,
        hasData,
        matchingRecording,
        offsetSeconds,
        isActive
      });
    }

    return result;
  }, [recordings, currentDate, activeRecording, mode]);

  // Filter out future slots and optionally empty slots
  const displayedSlots = useMemo(() => {
    return slots.filter((slot) => {
      if (slot.isFuture) return false;
      if (hideEmpty && !slot.hasData) return false;
      return true;
    });
  }, [slots, hideEmpty]);

  // Statistics
  const availableCount = slots.filter((s) => s.hasData && !s.isFuture).length;
  const totalValidSlots = slots.filter((s) => !s.isFuture).length;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md flex flex-col gap-3">
      {/* Header Info & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-800 text-orange-400 rounded-lg">
            <Clock size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-slate-100">{t('timeline.title')}</span>
              <span className="text-xs bg-slate-800 text-slate-300 font-mono px-2 py-0.5 rounded-full border border-slate-700">
                {currentDate}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {availableCount > 0 ? (
                <span>
                  <strong className="text-emerald-400 font-medium">{availableCount}</strong> of{' '}
                  {totalValidSlots} intervals with recordings
                </span>
              ) : (
                <span className="text-amber-400">{t('timeline.noRecordingsDate')}</span>
              )}
            </p>
          </div>
        </div>

        {/* Action Controls: Filter empty & Switch Live */}
        <div className="flex items-center gap-2">
          {onGoLive && (
            <button
              onClick={onGoLive}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                mode === 'live'
                  ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/30 border border-orange-500 ring-2 ring-orange-500/20 animate-pulse'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700'
              }`}
              title={t('timeline.watchLive')}
            >
              <Radio size={13} className={mode === 'live' ? 'text-white' : 'text-orange-500'} />
              <span>{t('timeline.live')}</span>
            </button>
          )}

          <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700">
            <button
              onClick={() => setHideEmpty(!hideEmpty)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                hideEmpty ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
              }`}
              title={hideEmpty ? t('timeline.showAll') : t('timeline.hideEmpty')}
            >
              {hideEmpty ? <EyeOff size={14} /> : <Eye size={14} />}
              <span className="hidden sm:inline">{hideEmpty ? t('timeline.showAll') : t('timeline.hideEmpty')}</span>
            </button>
          </div>

          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 ml-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-slate-700 transition-colors"
          >
            {isCollapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Grid of 30-Minute Seeking Buttons */}
      {!isCollapsed && (
        displayedSlots.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-1">
            <Clock size={24} className="text-slate-600 mb-1" />
            <span>{t('timeline.noDataInterval')}</span>
          </div>
        ) : (
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-2">
            {displayedSlots.map((slot) => {
              if (!slot.hasData) {
                return (
                  <button
                    key={slot.index}
                    disabled
                    title={`${slot.timeRangeLabel} - ${t('noData')}`}
                    className="flex flex-col items-center justify-center py-2 px-1 rounded-lg text-xs font-mono font-medium border border-slate-800/60 bg-slate-900/40 text-slate-600 opacity-40 cursor-not-allowed select-none"
                  >
                    <span className="text-[11px] font-semibold">{slot.label}</span>
                    <span className="text-[9px] text-slate-600 mt-0.5 tracking-tighter">{t('noData')}</span>
                  </button>
                );
              }

              return (
                <button
                  key={slot.index}
                  onClick={() => {
                    if (slot.matchingRecording) {
                      onSeek(slot.matchingRecording, slot.offsetSeconds);
                    }
                  }}
                  title={`Seek to ${slot.timeRangeLabel}`}
                  className={`group relative flex flex-col items-center justify-center py-2 px-1 rounded-lg text-xs font-mono font-medium border transition-all cursor-pointer select-none active:scale-95 ${
                    slot.isActive
                      ? 'bg-orange-600 text-white border-orange-500 shadow-md shadow-orange-600/30 ring-2 ring-orange-400/30'
                      : 'bg-slate-800/90 hover:bg-slate-750 hover:border-orange-500/60 text-slate-200 hover:text-white border-slate-700/80 shadow-sm'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <Play
                      size={10}
                      className={`transition-colors ${
                        slot.isActive ? 'text-white fill-white' : 'text-orange-500 group-hover:fill-orange-500'
                      }`}
                    />
                    <span className="text-[11px] font-bold tracking-tight">{slot.label}</span>
                  </div>
                  <span
                    className={`text-[9px] mt-0.5 tracking-tighter ${
                      slot.isActive ? 'text-orange-100 font-semibold' : 'text-emerald-400 group-hover:text-emerald-300'
                    }`}
                  >
                    {slot.isActive ? t('timeline.playing') : t('timeline.ready')}
                  </span>
                </button>
              );
            })}
          </div>
        )
      )}
    </div>
  );
};

export default TimelineControl;
