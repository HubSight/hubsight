import React from 'react';
import { Play, Pause, Square, Rewind, FastForward, Radio } from '@/components/icons';
import dayjs from 'dayjs';
import type { Recording } from '../../types/recording';
import { useTranslation } from '../../i18n';

interface MediaControlBarProps {
  mode: 'live' | 'archive';
  cameraId: string | null;
  isLive: boolean;
  activeRecording: Recording | null;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onSkip: (seconds: number) => void;
  onGoLive: () => void;
}

export const MediaControlBar: React.FC<MediaControlBarProps> = ({
  mode,
  cameraId,
  isLive,
  activeRecording,
  onPlay,
  onPause,
  onStop,
  onSkip,
  onGoLive
}) => {
  const { t } = useTranslation();
  const formatTime = (isoString: string) => {
    return dayjs(isoString).format('HH:mm:ss');
  };

  const isLiveActive = mode === 'live' && isLive && cameraId !== null;

  return (
    <div className="p-4 lg:px-6 lg:pt-4 lg:pb-2 shrink-0">
      <div className="bg-white dark:bg-slate-900 p-4 lg:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm rounded-xl border border-slate-200 dark:border-slate-800 relative overflow-hidden">
        
        {/* Left: Time display or Live indicator */}
        <div className="flex items-center gap-3 w-full sm:w-auto z-10">
          {isLiveActive ? (
            <div className="w-full sm:w-auto text-red-600 dark:text-red-400 font-mono bg-red-50 dark:bg-red-950/40 px-4 py-2.5 rounded-lg border border-red-200 dark:border-red-800/60 text-center text-sm md:text-base tracking-wider font-bold flex items-center justify-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping" />
              {t('playback.live').toUpperCase()}
            </div>
          ) : (
            <div className="w-full sm:w-auto text-slate-700 dark:text-slate-200 font-mono bg-slate-50 dark:bg-slate-800 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-center text-sm md:text-base tracking-wider font-medium">
              {mode === 'archive' && activeRecording
                ? `${formatTime(activeRecording.start_at)} - ${formatTime(activeRecording.end_at)}`
                : '00:00:00 - 00:00:00'}
            </div>
          )}
        </div>

        {/* Right: Controls & Actions aligned to the right */}
        <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2 md:gap-3 w-full sm:w-auto z-10">
          {mode === 'archive' && cameraId && (
            <button
              onClick={onGoLive}
              className="btn btn-primary flex items-center gap-2 text-sm shadow-sm justify-center mr-1 cursor-pointer"
            >
              <Radio size={16} className="text-white" />
              {t('playback.returnToLive')}
            </button>
          )}

          <button
            onClick={() => onSkip(-10)}
            disabled={isLiveActive || !activeRecording}
            className={`p-2.5 text-slate-500 dark:text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/40 rounded-full transition-all cursor-pointer ${
              isLiveActive || !activeRecording ? 'opacity-40 pointer-events-none' : ''
            }`}
            title={t('playback.rewind10s')}
          >
            <Rewind size={20} />
          </button>

          <div
            className={`flex items-center gap-1 bg-slate-50 dark:bg-slate-800 p-1.5 rounded-full border border-slate-200 dark:border-slate-700 ${
              isLiveActive || !activeRecording ? 'opacity-50 pointer-events-none' : ''
            }`}
          >
            <button
              onClick={onPlay}
              className="p-2.5 bg-orange-600 hover:bg-orange-500 text-white rounded-full transition-all shadow-sm cursor-pointer"
              title={t('playback.play')}
            >
              <Play size={20} className="fill-current ml-0.5" />
            </button>
            <button
              onClick={onPause}
              className="p-2.5 text-slate-600 dark:text-slate-300 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-white dark:hover:bg-slate-700 rounded-full transition-all shadow-sm cursor-pointer"
              title={t('playback.pause')}
            >
              <Pause size={20} className="fill-current" />
            </button>
            <button
              onClick={onStop}
              className="p-2.5 text-slate-600 dark:text-slate-300 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-white dark:hover:bg-slate-700 rounded-full transition-all shadow-sm cursor-pointer"
              title={t('playback.stop')}
            >
              <Square size={18} className="fill-current" />
            </button>
          </div>

          <button
            onClick={() => onSkip(10)}
            disabled={isLiveActive || !activeRecording}
            className={`p-2.5 text-slate-500 dark:text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/40 rounded-full transition-all cursor-pointer ${
              isLiveActive || !activeRecording ? 'opacity-40 pointer-events-none' : ''
            }`}
            title={t('playback.forward10s')}
          >
            <FastForward size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};
