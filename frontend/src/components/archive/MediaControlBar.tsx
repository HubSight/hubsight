import React from 'react';
import { Play, Pause, Square, Rewind, FastForward, Radio } from 'lucide-react';
import dayjs from 'dayjs';
import type { Recording } from '../../types/recording';

interface MediaControlBarProps {
  mode: 'live' | 'archive';
  activeRecording: Recording | null;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onSkip: (seconds: number) => void;
  onGoLive: () => void;
}

export const MediaControlBar: React.FC<MediaControlBarProps> = ({
  mode,
  activeRecording,
  onPlay,
  onPause,
  onStop,
  onSkip,
  onGoLive
}) => {
  const formatTime = (isoString: string) => {
    return dayjs(isoString).format('HH:mm:ss');
  };

  return (
    <div className="p-4 lg:px-6 lg:pt-4 lg:pb-2 shrink-0">
      <div className="bg-white p-4 lg:p-5 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm rounded-xl border border-slate-200 relative overflow-hidden">
        
        {/* Left: Time display or Live indicator */}
        <div className="flex items-center gap-3 w-full md:w-auto z-10">
          {mode === 'live' ? (
            <div className="w-full md:w-auto text-red-600 font-mono bg-red-50 px-4 py-2.5 rounded-lg border border-red-200 text-center text-sm md:text-base tracking-wider font-bold flex items-center justify-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping" />
              LIVE STREAMING
            </div>
          ) : (
            <div className="w-full md:w-auto text-slate-700 font-mono bg-slate-50 px-4 py-2.5 rounded-lg border border-slate-200 text-center text-sm md:text-base tracking-wider font-medium">
              {activeRecording
                ? `${formatTime(activeRecording.start_at)} - ${formatTime(activeRecording.end_at)}`
                : '00:00:00 - 00:00:00'}
            </div>
          )}
        </div>

        {/* Center: Playback Controls */}
        <div className="flex items-center gap-2 md:gap-4 z-10">
          <button
            onClick={() => onSkip(-10)}
            disabled={mode === 'live' || !activeRecording}
            className={`p-3 text-slate-500 hover:text-orange-600 hover:bg-orange-50 rounded-full transition-all cursor-pointer ${
              mode === 'live' || !activeRecording ? 'opacity-40 pointer-events-none' : ''
            }`}
            title="Rewind 10s"
          >
            <Rewind size={22} />
          </button>

          <div
            className={`flex items-center gap-1 bg-slate-50 p-1.5 rounded-full border border-slate-200 ${
              mode === 'live' || !activeRecording ? 'opacity-50 pointer-events-none' : ''
            }`}
          >
            <button
              onClick={onPlay}
              className="p-3 bg-orange-600 hover:bg-orange-500 text-white rounded-full transition-all shadow-sm cursor-pointer"
              title="Play"
            >
              <Play size={22} className="fill-current ml-0.5" />
            </button>
            <button
              onClick={onPause}
              className="p-3 text-slate-600 hover:text-orange-600 hover:bg-white rounded-full transition-all shadow-sm cursor-pointer"
              title="Pause"
            >
              <Pause size={22} className="fill-current" />
            </button>
            <button
              onClick={onStop}
              className="p-3 text-slate-600 hover:text-orange-600 hover:bg-white rounded-full transition-all shadow-sm cursor-pointer"
              title="Stop"
            >
              <Square size={20} className="fill-current" />
            </button>
          </div>

          <button
            onClick={() => onSkip(10)}
            disabled={mode === 'live' || !activeRecording}
            className={`p-3 text-slate-500 hover:text-orange-600 hover:bg-orange-50 rounded-full transition-all cursor-pointer ${
              mode === 'live' || !activeRecording ? 'opacity-40 pointer-events-none' : ''
            }`}
            title="Forward 10s"
          >
            <FastForward size={22} />
          </button>
        </div>

        {/* Right: Return to Live Action */}
        <div className="flex justify-end w-full md:w-auto z-10">
          {mode === 'archive' ? (
            <button
              onClick={onGoLive}
              className="btn btn-primary flex items-center gap-2 text-sm shadow-sm w-full md:w-auto justify-center"
            >
              <Radio size={16} className="text-white" />
              Return to Live
            </button>
          ) : (
            <div className="text-xs text-slate-400 font-medium hidden md:block">
              Click timeline below to view archive
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
