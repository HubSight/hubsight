import React, { useState, useRef, useEffect } from 'react';
import { Camera, Calendar as CalendarIcon, ChevronDown } from 'lucide-react';
import Calendar from 'react-calendar';
import dayjs from 'dayjs';
import 'react-calendar/dist/Calendar.css';
import type { CameraItem, Recording } from '../../types/recording';
import { useTranslation } from '../../i18n';

interface ArchiveSidebarProps {
  cameras: CameraItem[];
  selectedCam: string;
  onSelectCam: (camId: string) => void;
  dateObj: Date;
  onSelectDate: (date: Date) => void;
  recordings: Recording[];
  loading: boolean;
  availableDays: number[];
  onMonthChange: (date: Date | null) => void;
}

export const ArchiveSidebar: React.FC<ArchiveSidebarProps> = ({
  cameras,
  selectedCam,
  onSelectCam,
  dateObj,
  onSelectDate,
  recordings,
  loading,
  availableDays,
  onMonthChange
}) => {
  const { t } = useTranslation();
  const [showCalendar, setShowCalendar] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);

  // Close calendar when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (calendarRef.current && !calendarRef.current.contains(event.target as Node)) {
        setShowCalendar(false);
      }
    }
    if (showCalendar) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showCalendar]);

  return (
    <div className="flex flex-wrap items-center gap-4 lg:gap-6 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
      
      {/* Camera Selection */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-sm text-slate-600 font-medium whitespace-nowrap">
          <Camera size={16} /> {t('playback.device')}
        </label>
        <select
          className="input-field bg-slate-50 border-slate-200 min-w-[150px] py-1.5"
          value={selectedCam}
          onChange={(e) => onSelectCam(e.target.value)}
          disabled={cameras.length === 0}
        >
          {cameras.length === 0 ? (
            <option value="">{t('playback.noDevices')}</option>
          ) : (
            cameras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))
          )}
        </select>
      </div>

      {/* Date Selection (Popover) */}
      <div className="flex items-center gap-3 relative" ref={calendarRef}>
        <label className="flex items-center gap-1.5 text-sm text-slate-600 font-medium whitespace-nowrap">
          <CalendarIcon size={16} /> {t('playback.date')}
        </label>
        <button
          className={`input-field bg-slate-50 border-slate-200 min-w-[150px] py-1.5 flex justify-between items-center ${
            !selectedCam ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-100 cursor-pointer'
          }`}
          onClick={() => selectedCam && setShowCalendar(!showCalendar)}
          disabled={!selectedCam}
        >
          <span>{dayjs(dateObj).format('DD MMM, YYYY')}</span>
          <ChevronDown size={14} className="text-slate-400" />
        </button>

        {/* Calendar Popover */}
        {showCalendar && (
          <div className="absolute top-full mt-2 left-0 z-50 glass-panel p-2 bg-white shadow-xl border border-slate-100 rounded-xl">
            <Calendar
              onChange={(val) => {
                onSelectDate(val as Date);
                setShowCalendar(false);
              }}
              value={dateObj}
              onActiveStartDateChange={({ activeStartDate }) => {
                onMonthChange(activeStartDate);
              }}
              tileDisabled={({ date, view }) => {
                if (view === 'month') {
                  return !availableDays.includes(date.getDate());
                }
                return false;
              }}
              className="react-calendar border-0"
            />
          </div>
        )}
      </div>

      <div className="w-px h-8 bg-slate-200 hidden md:block mx-2"></div>

      {/* Recording Status */}
      <div className="flex items-center gap-2 text-sm ml-auto">
        <span className="text-slate-500 font-medium">{t('playback.recordings')}</span>
        {loading ? (
          <span className="text-slate-400">{t('loading')}</span>
        ) : recordings.length === 0 ? (
          <span className="text-slate-400">{t('noData')}</span>
        ) : (
          <span className="text-orange-600 font-bold bg-orange-50 px-2 py-0.5 rounded-md">
            {recordings.length} {t('playback.clips')}
          </span>
        )}
      </div>

    </div>
  );
};
