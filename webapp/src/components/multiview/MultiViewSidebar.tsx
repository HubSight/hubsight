import React, { useState } from 'react';
import { Search, ChevronLeft, ChevronRight, Camera, X } from '@/components/icons';
import type { CameraItem } from '@hubsight/sdk';
import { DraggableCameraItem } from './DraggableCameraItem';
import { useTranslation } from '../../i18n';

export interface MultiViewSidebarProps {
  cameras: CameraItem[];
  slots: (string | null)[];
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onQuickAdd: (cameraId: string) => void;
}

export const MultiViewSidebar: React.FC<MultiViewSidebarProps> = ({
  cameras,
  slots,
  isCollapsed,
  onToggleCollapse,
  onQuickAdd,
}) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredCameras = cameras.filter((cam) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      cam.name.toLowerCase().includes(term) ||
      (cam.brand && cam.brand.toLowerCase().includes(term)) ||
      (cam.host && cam.host.toLowerCase().includes(term))
    );
  });

  const activeCount = cameras.filter((c) => c.is_active && !c.is_stopped).length;

  if (isCollapsed) {
    return (
      <div className="hidden lg:flex flex-col items-center py-4 px-2 bg-white border-r border-slate-200 shrink-0">
        <button
          type="button"
          onClick={onToggleCollapse}
          title={t('nav.expandSidebar')}
          className="p-2 rounded-xl text-slate-500 hover:text-orange-600 hover:bg-orange-50 transition-colors cursor-pointer"
        >
          <ChevronRight size={18} />
        </button>
        <div className="mt-4 flex flex-col items-center gap-2 text-slate-400">
          <Camera size={18} />
          <span className="text-[10px] font-bold text-slate-500 rotate-90 my-6">
            CAMERAS
          </span>
        </div>
      </div>
    );
  }

  return (
    <aside className="w-full lg:w-72 xl:w-80 bg-white border-r border-slate-200 flex flex-col shrink-0 h-full min-h-0">
      {/* Sidebar Header */}
      <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 truncate">
            <Camera size={16} className="text-orange-600 shrink-0" />
            <span>{t('multiview.sidebarTitle')}</span>
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {t('multiview.activeStreamsCount', {
              active: activeCount.toString(),
              total: cameras.length.toString(),
            })}
          </p>
        </div>

        <button
          type="button"
          onClick={onToggleCollapse}
          title={t('nav.collapseSidebar')}
          className="hidden lg:flex p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
        >
          <ChevronLeft size={18} />
        </button>
      </div>

      {/* Search Bar */}
      <div className="px-4 py-2.5 border-b border-slate-100 shrink-0">
        <div className="relative flex items-center">
          <Search size={15} className="absolute left-3 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t('multiview.searchPlaceholder')}
            className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-orange-500 focus:bg-white transition-all"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 p-0.5 text-slate-400 hover:text-slate-600 rounded-md cursor-pointer"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Drag & Drop Hint Banner */}
      <div className="px-4 py-2 bg-orange-50/50 border-b border-orange-100/60 text-[11px] text-orange-800 shrink-0 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
        <span className="truncate">{t('multiview.sidebarSubtitle')}</span>
      </div>

      {/* Cameras List */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2 custom-scrollbar">
        {filteredCameras.length === 0 ? (
          <div className="py-10 text-center text-slate-400">
            <Camera size={28} className="mx-auto mb-2 text-slate-300 stroke-1" />
            <p className="text-xs font-medium">{t('multiview.noCamerasFound')}</p>
          </div>
        ) : (
          filteredCameras.map((camera) => {
            const slotIdx = slots.indexOf(camera.id);
            const isInGrid = slotIdx !== -1;

            return (
              <DraggableCameraItem
                key={camera.id}
                camera={camera}
                isInGrid={isInGrid}
                gridSlotIndex={isInGrid ? slotIdx : null}
                onQuickAdd={onQuickAdd}
              />
            );
          })
        )}
      </div>
    </aside>
  );
};

