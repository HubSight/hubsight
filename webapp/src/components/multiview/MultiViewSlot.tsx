import React, { useState, useEffect } from 'react';
import {
  Plus,
  X,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  GripVertical,
  Loader2,
  AlertCircle,
  VideoOff,
  Scaling,
} from '@/components/icons';
import { useLiveStream } from '@hubsight/sdk/react';
import type { CameraItem } from '@hubsight/sdk';
import { useTranslation } from '../../i18n';

export interface MultiViewSlotProps {
  slotIndex: number;
  cameraId: string | null;
  camera?: CameraItem;
  isAudioActive: boolean;
  isMaximized: boolean;
  fitMode?: 'contain' | 'cover';
  onDropCamera: (targetSlotIndex: number, cameraId: string, sourceSlotIndex?: number) => void;
  onRemoveCamera: (slotIndex: number) => void;
  onToggleAudio: (slotIndex: number) => void;
  onToggleMaximize: (slotIndex: number) => void;
  onOpenSelector?: (slotIndex: number) => void;
}

export const MultiViewSlot: React.FC<MultiViewSlotProps> = ({
  slotIndex,
  cameraId,
  camera,
  isAudioActive,
  isMaximized,
  fitMode = 'contain',
  onDropCamera,
  onRemoveCamera,
  onToggleAudio,
  onToggleMaximize,
  onOpenSelector,
}) => {
  const { t } = useTranslation();
  const [isDragOver, setIsDragOver] = useState(false);
  const [localFit, setLocalFit] = useState<'contain' | 'cover'>(fitMode);

  // Keep localFit synced with global fitMode if updated
  useEffect(() => {
    setLocalFit(fitMode);
  }, [fitMode]);

  const isCameraActive = camera ? camera.is_active && !camera.is_stopped : false;

  const { videoRef, status, error, hasAudio } = useLiveStream(cameraId, {
    enabled: Boolean(cameraId && isCameraActive),
  });

  // Sync audio state with HTMLVideoElement
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !isAudioActive;
    if (isAudioActive) {
      video.volume = 1;
      video.play().catch(() => { });
    }
  }, [isAudioActive, videoRef]);

  // Drag & Drop handlers on the slot container
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    // Only remove highlight if actually leaving the container
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);

    const rawJson = e.dataTransfer.getData('application/json');
    if (rawJson) {
      try {
        const payload = JSON.parse(rawJson);
        if (payload.type === 'slot_swap' && typeof payload.sourceSlotIndex === 'number') {
          onDropCamera(slotIndex, payload.cameraId, payload.sourceSlotIndex);
          return;
        }
      } catch {
        // Fallback to text/plain
      }
    }

    const droppedCamId = e.dataTransfer.getData('text/plain');
    if (droppedCamId) {
      onDropCamera(slotIndex, droppedCamId);
    }
  };

  const handleSlotDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    if (!cameraId) return;
    e.dataTransfer.setData('text/plain', cameraId);
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({
        type: 'slot_swap',
        sourceSlotIndex: slotIndex,
        cameraId,
      }),
    );
    e.dataTransfer.effectAllowed = 'move';
  };

  // ── Render Empty Slot ───────────────────────────────────────────────────────
  if (!cameraId) {
    return (
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => onOpenSelector?.(slotIndex)}
        className={`group relative w-full h-full flex flex-col items-center justify-center border-2 border-dashed rounded-2xl transition-all cursor-pointer select-none p-4 ${isDragOver
            ? 'border-orange-500 bg-orange-500/10 scale-[0.99] ring-2 ring-orange-500/30'
            : 'border-slate-300/80 dark:border-slate-800 bg-slate-900/5 dark:bg-slate-900/40 hover:border-orange-400 dark:hover:border-orange-500/60 hover:bg-orange-50/20 dark:hover:bg-orange-950/20'
          }`}
      >
        {/* Slot Number Badge */}
        <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-500 dark:text-slate-400 shadow-xs">
          {t('multiview.slot', { num: (slotIndex + 1).toString() })}
        </div>

        <div className="flex flex-col items-center gap-2 text-center pointer-events-none">
          <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all ${isDragOver
                ? 'bg-orange-500 text-white shadow-md scale-110'
                : 'bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-400 border border-slate-200 dark:border-slate-700 group-hover:text-orange-600 dark:group-hover:text-orange-400 group-hover:border-orange-200 dark:group-hover:border-orange-500 group-hover:scale-105 shadow-xs'
              }`}
          >
            <Plus size={20} />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">
              {t('multiview.dropHere')}
            </p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
              {t('multiview.clickToSelect')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Render Occupied Slot ────────────────────────────────────────────────────
  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`group relative w-full h-full bg-black rounded-2xl overflow-hidden border transition-all flex items-center justify-center select-none shadow-md ${isDragOver
          ? 'ring-2 ring-orange-500 border-orange-500'
          : 'border-slate-800 hover:border-slate-700'
        }`}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        controls={false}
        autoPlay
        playsInline
        muted={!isAudioActive}
        className={`w-full h-full pointer-events-none transition-all ${localFit === 'cover' ? 'object-cover' : 'object-contain'
          }`}
      />

      {/* Top Header Overlay: Slot info & Controls */}
      <div className="absolute top-0 inset-x-0 p-2 sm:p-2.5 bg-gradient-to-b from-black/85 via-black/40 to-transparent flex items-center justify-between gap-2 z-20 transition-opacity">
        {/* Left: Drag Handle, Slot pill, Camera Name */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <div
            draggable
            onDragStart={handleSlotDragStart}
            title={t('multiview.dragToSwap')}
            className="p-1 text-white/50 hover:text-white cursor-grab active:cursor-grabbing rounded hover:bg-white/10 shrink-0"
          >
            <GripVertical size={14} />
          </div>

          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-white/20 text-white/90 shrink-0 backdrop-blur-xs">
            #{slotIndex + 1}
          </span>

          <div className="flex items-center gap-1.5 truncate">
            {isCameraActive && status === 'live' && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 animate-pulse" />
            )}
            <span
              className="text-xs font-semibold text-white truncate max-w-[120px] sm:max-w-[200px]"
              title={camera?.name || cameraId}
            >
              {camera?.name || cameraId}
            </span>
          </div>
        </div>

        {/* Right: Quick Action Controls */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Audio Solo Toggle */}
          {hasAudio && (
            <button
              type="button"
              onClick={() => onToggleAudio(slotIndex)}
              title={isAudioActive ? t('multiview.muted') : t('multiview.unmuteSolo')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${isAudioActive
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'text-white/70 hover:text-white hover:bg-white/15'
                }`}
            >
              {isAudioActive ? <Volume2 size={14} /> : <VolumeX size={14} />}
            </button>
          )}

          {/* Aspect Fit/Fill Toggle */}
          <button
            type="button"
            onClick={() => setLocalFit((f) => (f === 'contain' ? 'cover' : 'contain'))}
            title={localFit === 'contain' ? t('multiview.fitCover') : t('multiview.fitContain')}
            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
          >
            <Scaling size={14} />
          </button>

          {/* Maximize Slot Toggle */}
          <button
            type="button"
            onClick={() => onToggleMaximize(slotIndex)}
            title={isMaximized ? t('multiview.minimize') : t('multiview.maximize')}
            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
          >
            {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>

          {/* Remove / Clear Slot */}
          <button
            type="button"
            onClick={() => onRemoveCamera(slotIndex)}
            title={t('multiview.removeSlot')}
            className="p-1.5 rounded-lg text-white/70 hover:text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* State Overlay: Connecting */}
      {isCameraActive && status === 'connecting' && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center gap-2 text-white z-10 pointer-events-none">
          <Loader2 className="animate-spin text-orange-500" size={24} />
          <span className="text-xs text-slate-300 font-medium">{t('loading')}</span>
        </div>
      )}

      {/* State Overlay: Camera Stopped */}
      {(!isCameraActive || camera?.is_stopped) && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-center gap-2 text-slate-400 p-4 text-center z-10">
          <VideoOff className="text-slate-500" size={28} />
          <span className="text-xs font-semibold text-slate-300">
            {t('multiview.allCamerasOffline')}
          </span>
        </div>
      )}

      {/* State Overlay: WebRTC Stream Error */}
      {isCameraActive && error && (
        <div className="absolute inset-0 bg-slate-950/85 flex flex-col items-center justify-center gap-2 text-slate-400 p-4 text-center z-10">
          <AlertCircle className="text-amber-500" size={26} />
          <span className="text-xs font-semibold text-white">{t('error')}</span>
          <p className="text-[10px] text-slate-400 max-w-xs">{error.message}</p>
        </div>
      )}

      {/* Audio solo banner in bottom-left */}
      {isAudioActive && (
        <div className="absolute bottom-2.5 left-2.5 z-20 flex items-center gap-1.5 px-2 py-1 rounded-md bg-orange-600/90 text-white text-[10px] font-bold shadow-md backdrop-blur-xs pointer-events-none">
          <Volume2 size={12} className="animate-pulse" />
          <span>AUDIO LIVE</span>
        </div>
      )}
    </div>
  );
};

