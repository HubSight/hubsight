import React from 'react';
import { GripVertical, Plus, Check, Bot, AlertCircle } from 'lucide-react';
import type { CameraItem } from '@hubsight/sdk';
import { useTranslation } from '../../i18n';

interface DraggableCameraItemProps {
  camera: CameraItem;
  isInGrid: boolean;
  gridSlotIndex: number | null;
  onQuickAdd: (cameraId: string) => void;
}

export const DraggableCameraItem: React.FC<DraggableCameraItemProps> = ({
  camera,
  isInGrid,
  gridSlotIndex,
  onQuickAdd,
}) => {
  const { t } = useTranslation();
  const isOnline = camera.is_active && !camera.is_stopped;

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    if (!isOnline) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('text/plain', camera.id);
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({ type: 'camera', id: camera.id, name: camera.name }),
    );
    e.dataTransfer.effectAllowed = 'copyMove';
  };

  return (
    <div
      draggable={isOnline}
      onDragStart={handleDragStart}
      className={`group relative flex items-center justify-between p-3 rounded-xl border transition-all select-none ${!isOnline
          ? 'bg-slate-50/80 border-slate-200/60 opacity-60 cursor-not-allowed'
          : isInGrid
            ? 'bg-orange-50/40 border-orange-200/80 hover:border-orange-300 cursor-grab active:cursor-grabbing shadow-xs'
            : 'bg-white border-slate-200 hover:border-orange-300 hover:shadow-xs cursor-grab active:cursor-grabbing'
        }`}
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        {/* Drag Handle Icon */}
        <div
          className={`shrink-0 ${isOnline ? 'text-slate-400 group-hover:text-orange-500' : 'text-slate-300'
            }`}
        >
          <GripVertical size={16} />
        </div>

        {/* Status Indicator */}
        <div className="relative flex items-center justify-center shrink-0">
          <span
            className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-slate-300'
              }`}
          />
          {isOnline && (
            <span className="absolute w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping opacity-40" />
          )}
        </div>

        {/* Camera Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-semibold text-slate-800 truncate" title={camera.name}>
              {camera.name}
            </p>
            {camera.enable_ai && (
              <span
                className="inline-flex items-center px-1.5 py-0.2 text-[9px] font-bold rounded bg-purple-50 text-purple-700 border border-purple-200 shrink-0"
                title="AI Powered"
              >
                <Bot size={10} className="mr-0.5" />
                AI
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-600 truncate mt-0.5">
            {camera.brand || 'RTSP'} • {camera.host || 'Direct Stream'}
          </p>
        </div>
      </div>

      {/* Right side: Slot badge or Quick Add button */}
      <div className="flex items-center gap-1.5 shrink-0 ml-2">
        {isInGrid && gridSlotIndex !== null ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-orange-100 text-orange-700 border border-orange-200">
            <Check size={11} />
            {t('multiview.slotBadge', { num: (gridSlotIndex + 1).toString() })}
          </span>
        ) : isOnline ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onQuickAdd(camera.id);
            }}
            title={t('multiview.clickToSelect')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-orange-600 hover:bg-orange-50 transition-colors cursor-pointer"
          >
            <Plus size={15} />
          </button>
        ) : (
          <span
            className="text-slate-400 p-1"
            title={t('multiview.allCamerasOffline')}
          >
            <AlertCircle size={14} />
          </span>
        )}
      </div>
    </div>
  );
};

