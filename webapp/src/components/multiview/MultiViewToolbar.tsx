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
} from '@/components/icons';
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
    <header className="px-4 sm:px-6 md:px-8 py-3.5 sm:py-4 bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 sm:gap-4 shrink-0 select-none shadow-xs">
      {/* Left side: Sidebar Toggle & Page Title */}
      <div className="flex items-center gap-3 sm:gap-3.5">
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            title={t('nav.expandSidebar')}
            className="lg:hidden p-2 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Menu size={18} />
          </button>
        )}

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-950/50 border border-orange-200/80 dark:border-orange-500/30 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0 shadow-2xs">
            <LayoutGrid size={20} />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-tight">
              {t('multiview.title')}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 hidden sm:block font-medium">
              {t('multiview.subtitle')}
            </p>
          </div>
        </div>
      </div>

      {/* Middle/Right: Layout selector + Action buttons */}
      <div className="flex items-center gap-2 flex-wrap ml-auto">
        {/* Layout Presets Buttons */}
        <div className="flex bg-slate-100/90 dark:bg-slate-800/90 p-1 rounded-xl gap-1 border border-slate-200/80 dark:border-slate-700/80">
          {/* 1x1 */}
          <button
            type="button"
            onClick={() => onSelectLayout(1)}
            title={t('multiview.layout1')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${layout === 1
                ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
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
                ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
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
                ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
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
                ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
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
          <Sparkles size={14} className="text-orange-600 dark:text-orange-400" />
          <span className="hidden sm:inline">{t('multiview.autoFill')}</span>
        </button>

        {/* Action: Clear All */}
        <button
          type="button"
          onClick={onClearAll}
          title={t('multiview.clearAll')}
          className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
        >
          <Trash2 size={15} />
        </button>

        {/* Action: Toggle Fullscreen */}
        <button
          type="button"
          onClick={onToggleFullscreen}
          title={isFullscreen ? t('multiview.exitFullscreen') : t('multiview.fullscreen')}
          className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
        >
          {isFullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
        </button>

        {/* Link to Playback */}
        <button
          type="button"
          onClick={() => navigate('/playback')}
          title={t('multiview.switchToPlayback')}
          className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-50/50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <Film size={14} />
          <span>{t('nav.playback')}</span>
        </button>
      </div>
    </header>
  );
};

