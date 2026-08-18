import React from 'react';
import { Camera, Radio } from 'lucide-react';
import type { Recording } from '../../types/recording';
import { LivePlayer } from './LivePlayer';

interface VideoPlayerProps {
  mode: 'live' | 'archive';
  cameraId: number | null;
  activeRecording: Recording | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onLoadedMetadata: () => void;
  onGoLive?: () => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  mode,
  cameraId,
  activeRecording,
  videoRef,
  onLoadedMetadata,
  onGoLive
}) => {
  return (
    <div className="sticky top-0 z-30 w-full bg-black aspect-video lg:aspect-auto lg:flex-1 lg:min-h-0 flex flex-col items-center justify-center shrink-0 lg:mt-4 lg:mx-4 lg:w-[calc(100%-2rem)] lg:rounded-xl shadow-sm overflow-hidden lg:border border-slate-200 relative group">
      
      {/* Live Badge Overlay */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2 pointer-events-none">
        {mode === 'live' ? (
          <div className="flex items-center gap-1.5 bg-red-600/90 text-white px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase shadow-md backdrop-blur-xs animate-pulse">
            <span className="w-2 h-2 rounded-full bg-white animate-ping" />
            LIVE
          </div>
        ) : (
          <div className="flex items-center gap-1.5 bg-slate-900/80 text-amber-400 px-3 py-1 rounded-full text-xs font-semibold tracking-wide border border-amber-500/30 shadow-md backdrop-blur-xs">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            ARCHIVE PLAYBACK
          </div>
        )}
      </div>

      {/* Return to Live Quick Button Overlay (Visible during Archive mode) */}
      {mode === 'archive' && onGoLive && (
        <div className="absolute top-4 right-4 z-20">
          <button
            onClick={onGoLive}
            className="flex items-center gap-1.5 bg-slate-900/80 hover:bg-orange-600 text-white px-3.5 py-1.5 rounded-full text-xs font-bold tracking-wide shadow-lg border border-slate-700 hover:border-orange-500 transition-all cursor-pointer backdrop-blur-xs"
          >
            <Radio size={14} className="text-red-400" />
            Switch to Live
          </button>
        </div>
      )}

      {/* Mode 1: Real-time Live Stream */}
      {mode === 'live' && cameraId ? (
        <LivePlayer cameraId={cameraId} />
      ) : mode === 'archive' && activeRecording ? (
        /* Mode 2: Archive Recorded Playback */
        <video
          ref={videoRef}
          src={`/api/archive/${activeRecording.id}/stream`}
          controls
          autoPlay
          playsInline
          onLoadedMetadata={onLoadedMetadata}
          className="w-full h-full object-contain"
        />
      ) : (
        <div className="flex flex-col items-center justify-center text-slate-400 gap-3">
          <Camera size={48} className="opacity-20" />
          <div className="text-lg">No stream or recording selected</div>
        </div>
      )}
    </div>
  );
};
