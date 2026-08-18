import React, { useMemo, useRef } from 'react';
import dayjs from 'dayjs';

import type { Recording } from '../types/recording';

interface TimelineControlProps {
  recordings: Recording[];
  currentDate: string; // YYYY-MM-DD
  onSeek: (recording: Recording, offsetSeconds: number) => void;
}

const TimelineControl = ({ recordings, currentDate, onSeek }: TimelineControlProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Create 24 hour markers
  const hours = Array.from({ length: 25 }, (_, i) => i);
  
  const blocks = useMemo(() => {
    // We assume the backend stores times in UTC and the date requested is standard format
    const startOfDayMs = new Date(`${currentDate}T00:00:00Z`).getTime();
    const dayLengthMs = 24 * 60 * 60 * 1000;
    
    return recordings.map(rec => {
      const startMs = new Date(rec.start_at).getTime();
      const endMs = new Date(rec.end_at).getTime();
      
      const leftPct = Math.max(0, ((startMs - startOfDayMs) / dayLengthMs) * 100);
      const widthPct = Math.min(100 - leftPct, ((endMs - startMs) / dayLengthMs) * 100);
      
      return {
        ...rec,
        leftPct,
        widthPct,
        startMs,
        endMs
      };
    });
  }, [recordings, currentDate]);

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = clickX / rect.width;
    
    const startOfDayMs = new Date(`${currentDate}T00:00:00Z`).getTime();
    const dayLengthMs = 24 * 60 * 60 * 1000;
    const clickedTimeMs = startOfDayMs + (pct * dayLengthMs);
    
    // Find recording containing this time
    const found = blocks.find(b => clickedTimeMs >= b.startMs && clickedTimeMs <= b.endMs);
    
    if (found) {
      const offsetMs = clickedTimeMs - found.startMs;
      onSeek(found, offsetMs / 1000);
    }
  };

  return (
    <div className="w-full overflow-x-auto pb-2 custom-scrollbar">
      <div className="min-w-[800px] w-full">
        <div 
          className="relative w-full h-16 bg-slate-200 rounded-lg cursor-pointer overflow-hidden border border-slate-300"
          onClick={handleTimelineClick}
          ref={containerRef}
        >
        {/* Hour grids */}
        {hours.map(h => (
          <div 
            key={h}
            className="absolute top-0 bottom-0 border-l border-slate-300/50 flex flex-col justify-start pointer-events-none"
            style={{ left: `${(h / 24) * 100}%` }}
          >
            <span className="text-[10px] text-slate-500 font-medium mt-1 ml-1 select-none">
              {h.toString().padStart(2, '0')}:00
            </span>
          </div>
        ))}

        {/* Recording blocks */}
        {blocks.map(b => (
          <div
            key={b.id}
            className="absolute top-6 bottom-0 bg-orange-500 hover:bg-orange-400 border-l border-r border-orange-700 transition-colors opacity-90"
            style={{ left: `${b.leftPct}%`, width: `${b.widthPct}%` }}
            title={`${dayjs(b.start_at).format('HH:mm:ss')} - ${dayjs(b.end_at).format('HH:mm:ss')}`}
          />
        ))}
        </div>
      </div>
    </div>
  );
};

export default TimelineControl;
