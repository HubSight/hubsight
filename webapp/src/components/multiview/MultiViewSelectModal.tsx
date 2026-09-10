import React from 'react';
import { X, Camera, Check, Bot } from '@/components/icons';
import type { CameraItem } from '@hubsight/sdk';
import { useTranslation } from '../../i18n';

export interface MultiViewSelectModalProps {
  slotIndex: number | null;
  cameras: CameraItem[];
  slots: (string | null)[];
  onSelectCamera: (slotIndex: number, cameraId: string) => void;
  onClose: () => void;
}

export const MultiViewSelectModal: React.FC<MultiViewSelectModalProps> = ({
  slotIndex,
  cameras,
  slots,
  onSelectCamera,
  onClose,
}) => {
  const { t } = useTranslation();

  if (slotIndex === null) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fade-in">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden z-10 flex flex-col max-h-[85dvh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/80">
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
              {t('multiview.selectCameraModalTitle', { num: (slotIndex + 1).toString() })}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {t('multiview.selectCameraModalSubtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* List of Cameras */}
        <div className="p-3 overflow-y-auto space-y-2 flex-1 custom-scrollbar">
          {cameras.length === 0 ? (
            <div className="py-10 text-center text-slate-400 dark:text-slate-500">
              <Camera size={32} className="mx-auto mb-2 text-slate-300 dark:text-slate-600 stroke-1" />
              <p className="text-xs">{t('multiview.allCamerasOffline')}</p>
            </div>
          ) : (
            cameras.map((cam) => {
              const isOnline = cam.is_active && !cam.is_stopped;
              const currentSlot = slots.indexOf(cam.id);
              const isInCurrentSlot = currentSlot === slotIndex;

              return (
                <div
                  key={cam.id}
                  onClick={() => {
                    if (isOnline) {
                      onSelectCamera(slotIndex, cam.id);
                      onClose();
                    }
                  }}
                  className={`flex items-center justify-between p-3 rounded-xl border transition-all ${!isOnline
                      ? 'bg-slate-50 dark:bg-slate-800/40 opacity-50 cursor-not-allowed border-slate-200 dark:border-slate-800/60'
                      : isInCurrentSlot
                        ? 'bg-orange-50 dark:bg-orange-950/40 border-orange-300 dark:border-orange-600 shadow-xs'
                        : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-orange-300 dark:hover:border-orange-500 hover:bg-orange-50/30 dark:hover:bg-orange-950/20 cursor-pointer'
                    }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${isOnline ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                        }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                          {cam.name}
                        </p>
                        {cam.enable_ai && (
                          <span className="inline-flex items-center px-1.5 py-0.2 text-[9px] font-bold rounded bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 shrink-0">
                            <Bot size={10} className="mr-0.5" />
                            AI
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 truncate">
                        {cam.brand || 'RTSP'} • {cam.host}
                      </p>
                    </div>
                  </div>

                  {currentSlot !== -1 && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 shrink-0 ml-2">
                      {t('multiview.slotBadge', { num: (currentSlot + 1).toString() })}
                    </span>
                  )}
                  {isInCurrentSlot && (
                    <Check size={16} className="text-orange-600 dark:text-orange-400 shrink-0 ml-1" />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

