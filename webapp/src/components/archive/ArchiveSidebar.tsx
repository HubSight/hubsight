import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Calendar as CalendarIcon, ChevronDown, LayoutGrid } from '@/components/icons';
import Calendar from 'react-calendar';
import dayjs from 'dayjs';
import 'react-calendar/dist/Calendar.css';
import type { CameraItem, Recording } from '../../types/recording';
import { useTranslation } from '../../i18n';
import 'dayjs/locale/vi';

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
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const [showCalendar, setShowCalendar] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close calendar or dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (calendarRef.current && !calendarRef.current.contains(event.target as Node)) {
        setShowCalendar(false);
      }
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    if (showCalendar || isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showCalendar, isDropdownOpen]);

  return (
    <div className="flex flex-wrap items-center gap-4 lg:gap-6 bg-white p-4 rounded-xl shadow-sm border border-slate-200">

      {/* Camera Selection */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-sm text-slate-600 font-medium whitespace-nowrap">
          <Camera size={16} /> {t('playback.device')}
        </label>

        <div className="relative" ref={dropdownRef}>
          <button
            className={`input-field bg-slate-50 border-slate-200 min-w-[180px] py-1.5 px-3 flex justify-between items-center rounded-lg ${cameras.length === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-100 cursor-pointer'
              }`}
            onClick={() => cameras.length > 0 && setIsDropdownOpen(!isDropdownOpen)}
            disabled={cameras.length === 0}
          >
            <span className="truncate text-sm pr-2 text-slate-700">
              {cameras.length === 0
                ? t('playback.noDevices')
                : cameras.find((c) => c.id === selectedCam)?.name || t('playback.selectDevice')}
            </span>
            <ChevronDown size={14} className={`text-slate-400 shrink-0 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown Menu */}
          {isDropdownOpen && cameras.length > 0 && (
            <div className="absolute top-full mt-1.5 left-0 z-50 w-full min-w-[200px] glass-panel py-1.5 bg-white shadow-xl border border-slate-100 rounded-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
              {cameras.map((c) => (
                <div
                  key={c.id}
                  className={`px-3 py-2 text-sm cursor-pointer hover:bg-slate-50 flex items-center justify-between transition-colors ${c.id === selectedCam ? 'text-orange-600 font-medium bg-orange-50/50' : 'text-slate-700'
                    }`}
                  onClick={() => {
                    onSelectCam(c.id);
                    setIsDropdownOpen(false);
                  }}
                >
                  <span className={`truncate ${c.is_stopped ? 'text-slate-400' : ''}`}>{c.name}</span>
                  <span className="flex items-center gap-1 shrink-0 ml-2">
                    {c.is_stopped && (
                      <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 font-semibold">
                        {t('playback.stoppedBadge')}
                      </span>
                    )}
                    {c.enable_ai && (
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200 shadow-sm font-semibold tracking-wider">
                        AI
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Date Selection (Popover) */}
      <div className="flex items-center gap-3 relative" ref={calendarRef}>
        <label className="flex items-center gap-1.5 text-sm text-slate-600 font-medium whitespace-nowrap">
          <CalendarIcon size={16} /> {t('playback.date')}
        </label>
        <button
          className={`input-field bg-slate-50 border-slate-200 min-w-[150px] py-1.5 flex justify-between items-center ${!selectedCam ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-100 cursor-pointer'
            }`}
          onClick={() => selectedCam && setShowCalendar(!showCalendar)}
          disabled={!selectedCam}
        >
          <span>{dayjs(dateObj).locale(locale).format(locale === 'vi' ? 'DD/MM/YYYY' : 'DD MMM, YYYY')}</span>
          <ChevronDown size={14} className="text-slate-400" />
        </button>

        {/* Calendar Popover */}
        {showCalendar && (
          <div className="absolute top-full mt-2 left-0 z-50 glass-panel p-2 bg-white shadow-xl border border-slate-100 rounded-xl">
            <Calendar
              locale={locale === 'vi' ? 'vi-VN' : 'en-US'}
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

      {/* Multi-View Link */}
      <div className="w-px h-8 bg-slate-200 hidden md:block mx-1"></div>
      <button
        type="button"
        onClick={() => navigate('/multiview')}
        title={t('multiview.switchToMultiView')}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-orange-200 bg-orange-50/70 text-orange-700 hover:bg-orange-100 text-xs font-semibold transition-colors cursor-pointer"
      >
        <LayoutGrid size={15} />
        <span>{t('multiview.switchToMultiView')}</span>
      </button>

    </div>
  );
};
