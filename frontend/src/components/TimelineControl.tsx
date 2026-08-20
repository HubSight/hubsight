import React, { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Clock, Play, Radio, Eye, EyeOff } from 'lucide-react';
import type { Recording } from '../types/recording';

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
  const [hideEmpty, setHideEmpty] = useState<boolean>(false);

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

  // Statistics
  const availableCount = useMemo(() => slots.filter((s) => s.hasData).length, [slots]);
  const totalValidSlots = useMemo(() => slots.filter((s) => !s.isFuture).length, [slots]);

  const displayedSlots = useMemo(() => {
    if (hideEmpty) {
      return slots.filter((s) => s.hasData);
    }
    // Only show slots up to current time if today, or all 48 slots if past date
    return slots.filter((s) => !s.isFuture);
  }, [slots, hideEmpty]);

  return (
    <div className="w-full bg-slate-900/90 text-slate-100 rounded-xl border border-slate-800 p-4 shadow-xl backdrop-blur-md">
      {/* Header / Summary Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3.5 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-orange-600/20 text-orange-500 rounded-lg border border-orange-500/30">
            <Clock size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-slate-100">Seeking Control (30-Minute Intervals)</span>
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
                <span className="text-amber-400">No recordings recorded for this date</span>
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
              title="Watch Real-time Live Stream"
            >
              <Radio size={13} className={mode === 'live' ? 'text-white' : 'text-orange-500'} />
              <span>LIVE</span>
            </button>
          )}

          <button
            onClick={() => setHideEmpty((prev) => !prev)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all cursor-pointer"
            title={hideEmpty ? 'Show all time intervals' : 'Hide intervals without recordings'}
          >
            {hideEmpty ? <Eye size={13} className="text-orange-400" /> : <EyeOff size={13} className="text-slate-400" />}
            <span>{hideEmpty ? 'Show All Intervals' : 'Hide Empty'}</span>
          </button>
        </div>
      </div>

      {/* Grid of 30-Minute Seeking Buttons */}
      {displayedSlots.length === 0 ? (
        <div className="py-8 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-1">
          <Clock size={24} className="text-slate-600 mb-1" />
          <span>No recordings available in any 30-minute intervals for this date.</span>
        </div>
      ) : (
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-2">
          {displayedSlots.map((slot) => {
            if (!slot.hasData) {
              return (
                <button
                  key={slot.index}
                  disabled
                  title={`${slot.timeRangeLabel} - No recording available`}
                  className="flex flex-col items-center justify-center py-2 px-1 rounded-lg text-xs font-mono font-medium border border-slate-800/60 bg-slate-900/40 text-slate-600 opacity-40 cursor-not-allowed select-none"
                >
                  <span className="text-[11px] font-semibold">{slot.label}</span>
                  <span className="text-[9px] text-slate-600 mt-0.5 tracking-tighter">No data</span>
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
                  {slot.isActive ? 'Playing' : 'Ready'}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TimelineControl;
