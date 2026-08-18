import React from 'react';
import { Camera, Calendar as CalendarIcon } from 'lucide-react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import type { CameraItem, Recording } from '../../types/recording';

interface ArchiveSidebarProps {
  cameras: CameraItem[];
  selectedCam: string;
  onSelectCam: (camId: string) => void;
  dateObj: Date;
  onSelectDate: (date: Date) => void;
  recordings: Recording[];
  loading: boolean;
}

export const ArchiveSidebar: React.FC<ArchiveSidebarProps> = ({
  cameras,
  selectedCam,
  onSelectCam,
  dateObj,
  onSelectDate,
  recordings,
  loading
}) => {
  return (
    <>
      <div className="mb-6">
        <label className="flex items-center gap-2 text-sm text-slate-600 font-medium mb-3">
          <Camera size={16} /> Select device
        </label>
        <select
          className="input-field w-full bg-slate-50 border-slate-200"
          value={selectedCam}
          onChange={(e) => onSelectCam(e.target.value)}
          disabled={cameras.length === 0}
        >
          {cameras.length === 0 ? (
            <option value="">No devices available</option>
          ) : (
            cameras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))
          )}
        </select>
      </div>

      <div className="mb-6">
        <label className="flex items-center gap-2 text-sm text-slate-600 font-medium mb-3">
          <CalendarIcon size={16} /> Select Date
        </label>
        <div
          className={`glass-panel p-2 bg-slate-50 ${!selectedCam ? 'opacity-50 pointer-events-none' : ''
            }`}
        >
          <Calendar
            onChange={(val) => onSelectDate(val as Date)}
            value={dateObj}
            className="react-calendar"
          />
        </div>
      </div>

      <div className="mt-auto pt-6 border-t border-slate-100">
        <label className="flex items-center gap-2 text-sm text-slate-600 font-medium mb-2">
          Recordings ({recordings.length})
        </label>
        {loading ? (
          <div className="text-slate-500 text-sm">Loading...</div>
        ) : recordings.length === 0 ? (
          <div className="text-slate-500 text-sm">No recordings found for this date.</div>
        ) : (
          <div className="text-orange-600 text-sm font-medium">Recordings available on timeline.</div>
        )}
      </div>
    </>
  );
};
