import React from 'react';
import {
  Grid2X2,
  LayoutGrid,
  Square,
  Sparkles,
  Trash2,
  Maximize,
  Minimize,
  Film,
  Menu,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../../i18n';

export type MultiViewLayout = 1 | 4 | 6 | 8;

export interface MultiViewToolbarProps {
  layout: MultiViewLayout;
  onSelectLayout: (layout: MultiViewLayout) => void;
  onAutoFill: () => void;
  onClearAll: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onToggleSidebar?: () => void;
  isSidebarCollapsed?: boolean;
}

export const MultiViewToolbar: React.FC<MultiViewToolbarProps> = ({
  layout,
  onSelectLayout,
  onAutoFill,
  onClearAll,
  isFullscreen,
  onToggleFullscreen,
  onToggleSidebar,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <header className="px-4 py-3 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0 select-none shadow-xs">
      {/* Left side: Sidebar Toggle & Page Title */}
      <div className="flex items-center gap-2.5">
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            title={t('nav.expandSidebar')}
            className="lg:hidden p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <Menu size={18} />
          </button>
        )}

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-orange-600 text-white flex items-center justify-center shadow-xs">
            <LayoutGrid size={17} />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-800 leading-none">
              {t('multiview.title')}
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5 hidden sm:block">
              {t('multiview.subtitle')}
            </p>
          </div>
        </div>
      </div>

      {/* Middle/Right: Layout selector + Action buttons */}
      <div className="flex items-center gap-2 flex-wrap ml-auto">
        {/* Layout Presets Buttons */}
        <div className="flex bg-slate-100/90 p-1 rounded-xl gap-1 border border-slate-200/80">
          {/* 1x1 */}
          <button
            type="button"
            onClick={() => onSelectLayout(1)}
            title={t('multiview.layout1')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${layout === 1
                ? 'bg-white text-orange-600 shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
              }`}
          >
            <Square size={14} />
            <span>1</span>
          </button>

          {/* 2x2 */}
          <button
            type="button"
            onClick={() => onSelectLayout(4)}
            title={t('multiview.layout4')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${layout === 4
                ? 'bg-white text-orange-600 shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
              }`}
          >
            <Grid2X2 size={14} />
            <span>4</span>
          </button>

          {/* 1+5 (6 slots) */}
          <button
            type="button"
            onClick={() => onSelectLayout(6)}
            title={t('multiview.layout6')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${layout === 6
                ? 'bg-white text-orange-600 shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
              }`}
          >
            <LayoutGrid size={14} />
            <span>6 (1+5)</span>
          </button>

          {/* 1+7 (8 slots) */}
          <button
            type="button"
            onClick={() => onSelectLayout(8)}
            title={t('multiview.layout8')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${layout === 8
                ? 'bg-white text-orange-600 shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
              }`}
          >
            <LayoutGrid size={14} />
            <span>8 (1+7)</span>
          </button>
        </div>

        {/* Action: Auto-fill */}
        <button
          type="button"
          onClick={onAutoFill}
          title={t('multiview.autoFill')}
          className="btn btn-secondary px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
        >
          <Sparkles size={14} className="text-orange-600" />
          <span className="hidden sm:inline">{t('multiview.autoFill')}</span>
        </button>

        {/* Action: Clear All */}
        <button
          type="button"
          onClick={onClearAll}
          title={t('multiview.clearAll')}
          className="p-2 rounded-xl text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer border border-slate-200 bg-white"
        >
          <Trash2 size={15} />
        </button>

        {/* Action: Toggle Fullscreen */}
        <button
          type="button"
          onClick={onToggleFullscreen}
          title={isFullscreen ? t('multiview.exitFullscreen') : t('multiview.fullscreen')}
          className="p-2 rounded-xl text-slate-600 hover:text-orange-600 hover:bg-slate-100 transition-colors cursor-pointer border border-slate-200 bg-white"
        >
          {isFullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
        </button>

        {/* Link to Playback */}
        <button
          type="button"
          onClick={() => navigate('/playback')}
          title={t('multiview.switchToPlayback')}
          className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:text-orange-600 hover:bg-orange-50/50 transition-colors cursor-pointer"
        >
          <Film size={14} />
          <span>{t('nav.playback')}</span>
        </button>
      </div>
    </header>
  );
};

