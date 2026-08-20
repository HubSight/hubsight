import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Radio,
  Gauge,
  Camera,
  Check,
  Download
} from 'lucide-react';
import dayjs from 'dayjs';
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

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

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
  const progressBarRef = useRef<HTMLDivElement>(null);

  // Playback & UI State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [volume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  // Seeking & Hover State
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<number | null>(null);
  const [centerAnim, setCenterAnim] = useState<'play' | 'pause' | null>(null);

  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Download Recording Video
  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeRecording) return;
    const baseUrl = import.meta.env.VITE_API_URL || '/api';
    const downloadUrl = `${baseUrl}/archive/${activeRecording.id}/stream?download=true`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.target = '_blank';
    link.download = `recording_${activeRecording.id}.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  // Format seconds to mm:ss
  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Format absolute time from recording timestamp
  const formatAbsoluteTime = (isoString?: string) => {
    if (!isoString) return '';
    return dayjs(isoString).format('HH:mm:ss');
  };

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      ));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    const container = containerRef.current;
    if (!container) return;

    try {
      const isFull = document.fullscreenElement || (document as any).webkitFullscreenElement;

      if (!isFull) {
        if (container.requestFullscreen) {
          await container.requestFullscreen();
        } else if ((container as any).webkitRequestFullscreen) {
          await (container as any).webkitRequestFullscreen();
        } else if ((container as any).msRequestFullscreen) {
          await (container as any).msRequestFullscreen();
        } else {
          // Fallback for iOS Safari which only supports fullscreen directly on <video> elements
          const videoElement = videoRef.current || container.querySelector('video');
          if (videoElement && (videoElement as any).webkitEnterFullscreen) {
            (videoElement as any).webkitEnterFullscreen();
          }
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        } else if ((document as any).msExitFullscreen) {
          await (document as any).msExitFullscreen();
        }
      }
    } catch (err) {
      console.error('Fullscreen toggle error:', err);
    }
  };

  // Auto-hide controls timer
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (isPlaying && !showSpeedMenu) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  }, [isPlaying, showSpeedMenu]);

  const handleMouseMove = () => {
    resetControlsTimer();
  };

  const handleMouseLeave = () => {
    if (isPlaying && !showSpeedMenu && !isScrubbing) {
      setShowControls(false);
    }
  };

  // Video event listeners replaced with React synthetic events directly on <video> tag.

  // Video controls
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setCenterAnim('play');
    } else {
      video.pause();
      setCenterAnim('pause');
    }
    setTimeout(() => setCenterAnim(null), 500);
  };

  const handleSkip = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.currentTime + seconds, duration));
    resetControlsTimer();
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isMuted) {
      video.muted = false;
      video.volume = volume || 1;
      setIsMuted(false);
    } else {
      video.muted = true;
      setIsMuted(true);
    }
  };

  const changePlaybackRate = (rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = rate;
    setPlaybackRate(rate);
    setShowSpeedMenu(false);
    resetControlsTimer();
  };

  // Progress Bar Seek Calculation
  const calculateProgressFromEvent = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || !duration) return 0;
    const rect = progressBarRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min((e.clientX - rect.left) / rect.width, 1));
    return pos * duration;
  };

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const newTime = calculateProgressFromEvent(e);
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const handleProgressBarMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsScrubbing(true);
    handleProgressBarClick(e);
  };

  useEffect(() => {
    if (!isScrubbing) return;
    const onMouseMove = (e: MouseEvent) => {
      if (!progressBarRef.current || !duration) return;
      const rect = progressBarRef.current.getBoundingClientRect();
      const pos = Math.max(0, Math.min((e.clientX - rect.left) / rect.width, 1));
      const newTime = pos * duration;
      setCurrentTime(newTime);
      if (videoRef.current) {
        videoRef.current.currentTime = newTime;
      }
    };
    const onMouseUp = () => {
      setIsScrubbing(false);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isScrubbing, duration, videoRef]);

  const handleProgressBarMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || !duration) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min((e.clientX - rect.left) / rect.width, 1));
    setHoverTime(pos * duration);
    setHoverPosition(pos * 100);
  };

  const handleProgressBarMouseLeave = () => {
    setHoverTime(null);
    setHoverPosition(null);
  };

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      if (mode === 'archive') {
        if (e.key === ' ' || e.key === 'k') {
          e.preventDefault();
          togglePlay();
        } else if (e.key === 'ArrowLeft' || e.key === 'j') {
          e.preventDefault();
          handleSkip(-10);
        } else if (e.key === 'ArrowRight' || e.key === 'l') {
          e.preventDefault();
          handleSkip(10);
        } else if (e.key === 'm') {
          e.preventDefault();
          toggleMute();
        }
      }

      if (e.key === 'f') {
        e.preventDefault();
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, duration]);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? (bufferedEnd / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="w-full bg-black aspect-video flex flex-col items-center justify-center shrink-0 overflow-hidden relative select-none group border-b border-slate-800 lg:max-h-[75vh]"
    >
      {/* ---------------------------------------------------- */}
      {/* 1. TOP OVERLAY BADGES & ACTIONS                     */}
      {/* ---------------------------------------------------- */}

      {/* Mode = LIVE: Pulsing LIVE badge at top left */}
      {mode === 'live' && isLive && cameraId && (
        <div className="absolute top-4 left-4 z-20 flex items-center gap-2 pointer-events-none">
          <div className="flex items-center gap-2 bg-orange-600 text-white px-3.5 py-1.5 rounded-full text-xs font-bold tracking-widest uppercase shadow-lg shadow-orange-600/30 backdrop-blur-md animate-pulse">
            <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
            LIVE
          </div>
        </div>
      )}

      {/* Mode = ARCHIVE: Top details + Switch to Live */}
      {mode === 'archive' && activeRecording && (
        <div
          className={`absolute top-0 left-0 right-0 z-20 p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
        >
          {/* Top-Left: Archive Segment Time Badge */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-slate-900/85 text-amber-300 px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-wide border border-amber-500/30 shadow-md backdrop-blur-md">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>
                {formatAbsoluteTime(activeRecording.start_at)} – {formatAbsoluteTime(activeRecording.end_at)}
              </span>
            </div>
          </div>
          {/* Top-Right: Switch to Live button */}
          <div className="flex items-center gap-2">

            {onGoLive && cameraId && (
              <button
                onClick={onGoLive}
                className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-500 text-white px-3.5 py-1.5 rounded-full text-xs font-bold tracking-wide shadow-lg shadow-orange-600/30 transition-all cursor-pointer backdrop-blur-md active:scale-95"
              >
                <Radio size={14} className="text-white" />
                <span>Switch to Live</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Center Action Pop Animation (Play/Pause indicator) */}
      {centerAnim && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <div className="p-4 bg-black/60 text-white rounded-full backdrop-blur-sm animate-ping">
            {centerAnim === 'play' ? <Play size={36} /> : <Pause size={36} />}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 2. VIDEO STREAMS (LIVE OR S3 ARCHIVE)               */}
      {/* ---------------------------------------------------- */}
      {mode === 'live' && cameraId ? (
        <div className="w-full h-full" onClick={toggleFullscreen}>
          <LivePlayer cameraId={cameraId} onLiveStatusChange={onLiveStatusChange} />
        </div>
      ) : mode === 'archive' && activeRecording ? (
        <video
          ref={videoRef}
          src={`${import.meta.env.VITE_API_URL || '/api'}/archive/${activeRecording.id}/stream`}
          autoPlay
          playsInline
          onLoadedMetadata={onLoadedMetadata}
          onClick={togglePlay}
          onPlay={() => {
            setIsPlaying(true);
            resetControlsTimer();
          }}
          onPause={() => {
            setIsPlaying(false);
            setShowControls(true);
          }}
          onTimeUpdate={(e) => {
            if (!isScrubbing) {
              setCurrentTime(e.currentTarget.currentTime);
            }
            if (e.currentTarget.buffered.length > 0) {
              setBufferedEnd(e.currentTarget.buffered.end(e.currentTarget.buffered.length - 1));
            }
          }}
          onDurationChange={(e) => {
            setDuration(e.currentTarget.duration || 0);
          }}
          className="w-full h-full object-contain cursor-pointer"
        />
      ) : (
        <div className="flex flex-col items-center justify-center text-slate-400 gap-3">
          <Camera size={48} className="opacity-20" />
          <div className="text-lg">No stream or recording selected</div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 3. YOUTUBE-STYLE BOTTOM CONTROLS & PROGRESS BAR      */}
      {/* ---------------------------------------------------- */}

      {/* CASE A: LIVE MODE -> Clean minimal bottom bar (Full Solid Orange-600 bar + Fullscreen) */}
      {mode === 'live' && cameraId && (
        <div className="absolute bottom-0 left-0 right-0 z-20 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-auto">
          {/* Full Solid Red-Orange (orange-600) Pinned Live Progress Bar */}
          <div className="w-full h-1 bg-orange-600 shadow-[0_0_8px_rgba(234,88,12,0.8)]" />

          {/* Minimal Controls Row for Live (Live status indicator + Fullscreen) */}
          <div className="px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-white/90">
              <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
              <span className="tracking-wide">Real-time Stream</span>
            </div>

            <button
              onClick={toggleFullscreen}
              className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-all cursor-pointer flex items-center justify-center"
              title={isFullscreen ? 'Exit Fullscreen (f)' : 'Fullscreen (f)'}
            >
              {isFullscreen ? <FullscreenExitIcon size={20} /> : <FullscreenEnterIcon size={20} />}
            </button>
          </div>
        </div>
      )}

      {/* CASE B: ARCHIVE MODE -> Full YouTube Player Controls */}
      {mode === 'archive' && activeRecording && (
        <div
          className={`absolute bottom-0 left-0 right-0 z-20 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-8 transition-opacity duration-300 pointer-events-auto ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
        >
          {/* --- Interactive YouTube Progress Bar --- */}
          <div
            ref={progressBarRef}
            onClick={handleProgressBarClick}
            onMouseDown={handleProgressBarMouseDown}
            onMouseMove={handleProgressBarMouseMove}
            onMouseLeave={handleProgressBarMouseLeave}
            className="group/progress relative w-full h-4 flex items-end cursor-pointer px-4 -mb-1 z-30"
          >
            {/* Timestamp hover tooltip */}
            {hoverTime !== null && hoverPosition !== null && (
              <div
                style={{ left: `${hoverPosition}%` }}
                className="absolute bottom-6 -translate-x-1/2 px-2 py-1 bg-slate-900/90 text-white text-[11px] font-mono rounded shadow-lg border border-white/10 pointer-events-none whitespace-nowrap"
              >
                {formatTime(hoverTime)}
              </div>
            )}

            {/* Progress track background */}
            <div className="relative w-full h-1 group-hover/progress:h-1.5 bg-white/20 rounded-full overflow-visible transition-all">
              {/* Buffered progress */}
              <div
                style={{ width: `${bufferedPercent}%` }}
                className="absolute top-0 left-0 h-full bg-white/35 rounded-full pointer-events-none"
              />
              {/* Played progress */}
              <div
                style={{ width: `${progressPercent}%` }}
                className="absolute top-0 left-0 h-full bg-orange-600 rounded-full pointer-events-none"
              />
              {/* Seeking Scrubber Knob */}
              <div
                style={{ left: `${progressPercent}%` }}
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 bg-orange-600 rounded-full shadow-md scale-0 group-hover/progress:scale-100 transition-transform pointer-events-none"
              />
            </div>
          </div>

          {/* --- Control Bar Buttons --- */}
          <div className="px-4 py-2.5 flex items-center justify-between">
            {/* Left Controls */}
            <div className="flex items-center gap-1 sm:gap-3">
              {/* Play / Pause Toggle */}
              <button
                onClick={togglePlay}
                className="p-2 text-white/90 hover:text-white hover:bg-white/15 rounded-lg transition-all cursor-pointer flex items-center justify-center"
                title={isPlaying ? 'Pause (k / space)' : 'Play (k / space)'}
              >
                {isPlaying ? <Pause size={20} /> : <Play size={20} />}
              </button>

              {/* Skip -10s */}
              <button
                onClick={() => handleSkip(-10)}
                className="p-2 text-white/80 hover:text-white hover:bg-white/15 rounded-lg transition-all cursor-pointer flex items-center justify-center"
                title="Rewind 10 seconds (j / ←)"
              >
                <RotateCcw size={18} />
              </button>

              {/* Skip +10s */}
              <button
                onClick={() => handleSkip(10)}
                className="p-2 text-white/80 hover:text-white hover:bg-white/15 rounded-lg transition-all cursor-pointer flex items-center justify-center"
                title="Fast-forward 10 seconds (l / →)"
              >
                <RotateCw size={18} />
              </button>

              {/* Volume & Slider (Hidden for now as audio stream is not supported) */}
              {/*
              <div className="group/vol flex items-center gap-1 pl-1">
                <button
                  onClick={toggleMute}
                  className="p-2 text-white/80 hover:text-white hover:bg-white/15 rounded-lg transition-all cursor-pointer flex items-center justify-center"
                  title={isMuted ? 'Unmute (m)' : 'Mute (m)'}
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX size={20} />
                  ) : volume < 0.5 ? (
                    <Volume1 size={20} />
                  ) : (
                    <Volume2 size={20} />
                  )}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                  className="w-0 group-hover/vol:w-16 sm:group-hover/vol:w-20 transition-all duration-200 accent-orange-500 h-1 cursor-pointer opacity-0 group-hover/vol:opacity-100"
                />
              </div>
              */}

              {/* Time Display: 01:23 / 05:00 */}
              <div className="text-xs font-mono text-white/80 ml-2 select-none">
                <span className="text-white font-medium">{formatTime(currentTime)}</span>
                <span className="mx-1 text-white/40">/</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Right Controls */}
            <div className="flex items-center gap-1 sm:gap-2 relative">
              {/* Playback Speed Selector */}
              <div className="relative">
                <button
                  onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                  className="px-2 py-1.5 text-xs font-semibold text-white/90 hover:text-white hover:bg-white/15 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                  title="Playback Speed"
                >
                  <Gauge size={16} />
                  <span>{playbackRate}x</span>
                </button>

                {/* Speed Popover Menu */}
                {showSpeedMenu && (
                  <div className="absolute bottom-full right-0 mb-2 w-32 bg-slate-900/95 border border-white/15 rounded-xl shadow-2xl overflow-hidden py-1 backdrop-blur-md z-40">
                    <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-white/10">
                      Speed
                    </div>
                    {PLAYBACK_RATES.map((rate) => (
                      <button
                        key={rate}
                        onClick={() => changePlaybackRate(rate)}
                        className={`w-full px-3 py-1.5 text-xs text-left flex items-center justify-between hover:bg-white/15 transition-colors cursor-pointer ${playbackRate === rate ? 'text-orange-500 font-bold' : 'text-white'
                          }`}
                      >
                        <span>{rate === 1 ? '1.0x (Normal)' : `${rate}x`}</span>
                        {playbackRate === rate && <Check size={14} className="text-orange-500" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Download Recording Video Button */}
              <button
                onClick={handleDownload}
                className="p-2 text-white/90 hover:text-white hover:bg-white/15 rounded-lg transition-all cursor-pointer flex items-center justify-center"
                title="Download Recording Video (MP4)"
              >
                <Download size={18} />
              </button>

              {/* Fullscreen Button */}
              <button
                onClick={toggleFullscreen}
                className="p-2 text-white/90 hover:text-white hover:bg-white/15 rounded-lg transition-all cursor-pointer flex items-center justify-center"
                title={isFullscreen ? 'Exit Fullscreen (f)' : 'Fullscreen (f)'}
              >
                {isFullscreen ? (
                  <FullscreenExitIcon size={20} />
                ) : (
                  <FullscreenEnterIcon size={20} />
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
