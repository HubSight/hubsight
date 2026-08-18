import React, { useRef, useState, useEffect } from 'react';
import { Camera, Radio } from 'lucide-react';
import type { Recording } from '../../types/recording';
import { LivePlayer } from './LivePlayer';
import { FullscreenEnterIcon, FullscreenExitIcon } from '../common/FullscreenIcons';

interface VideoPlayerProps {
  mode: 'live' | 'archive';
  cameraId: number | null;
  activeRecording: Recording | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  isLive: boolean;
  onLiveStatusChange?: (isLive: boolean) => void;
  onLoadedMetadata: () => void;
  onGoLive?: () => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  mode,
  cameraId,
  activeRecording,
  videoRef,
  containerRef: externalContainerRef,
  isLive,
  onLiveStatusChange,
  onLoadedMetadata,
  onGoLive
}) => {
  const internalContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = externalContainerRef || internalContainerRef;
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error('Fullscreen toggle error:', err);
    }
  };

  return (
    <div
      ref={containerRef}
      className="sticky top-0 z-30 w-full bg-black aspect-video lg:aspect-auto lg:flex-1 lg:min-h-0 flex flex-col items-center justify-center shrink-0 overflow-hidden relative group border-b border-slate-800"
    >
      {/* Live / Archive Badge Overlay (Top-Left) */}
      {mode === 'live' && isLive && cameraId ? (
        <div className="absolute top-4 left-4 z-20 flex items-center gap-2 pointer-events-none">
          <div className="flex items-center gap-1.5 bg-red-600/90 text-white px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase shadow-md backdrop-blur-xs animate-pulse">
            <span className="w-2 h-2 rounded-full bg-white animate-ping" />
            LIVE
          </div>
        </div>
      ) : mode === 'archive' && activeRecording ? (
        <div className="absolute top-4 left-4 z-20 flex items-center gap-2 pointer-events-none">
          <div className="flex items-center gap-1.5 bg-slate-900/80 text-amber-400 px-3 py-1 rounded-full text-xs font-semibold tracking-wide border border-amber-500/30 shadow-md backdrop-blur-xs">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            ARCHIVE PLAYBACK
          </div>
        </div>
      ) : null}

      {/* Switch to Live Overlay (Top-Right) */}
      {mode === 'archive' && onGoLive && cameraId && (
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

      {/* YouTube-style Fullscreen Button Overlay (Bottom-Right) */}
      {(cameraId || activeRecording) && (
        <div className="absolute bottom-4 right-4 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <button
            onClick={toggleFullscreen}
            className="p-2 bg-black/60 hover:bg-black/85 text-white/90 hover:text-white rounded-lg backdrop-blur-xs transition-all shadow-md cursor-pointer border border-white/10 hover:border-white/30 flex items-center justify-center"
            title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Full screen (f)'}
          >
            {isFullscreen ? (
              <FullscreenExitIcon size={20} />
            ) : (
              <FullscreenEnterIcon size={20} />
            )}
          </button>
        </div>
      )}

      {/* Mode 1: Real-time Live Stream */}
      {mode === 'live' && cameraId ? (
        <LivePlayer cameraId={cameraId} onLiveStatusChange={onLiveStatusChange} />
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
