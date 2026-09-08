import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Plus, Radar } from '@/components/icons';
import { useTranslation } from '../../i18n';

interface AddDeviceSplitButtonProps {
  onManual: () => void;
  onScan: () => void;
  size?: 'md' | 'lg';
  className?: string;
}

export const AddDeviceSplitButton: React.FC<AddDeviceSplitButtonProps> = ({
  onManual,
  onScan,
  size = 'md',
  className = '',
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const tall = size === 'lg';

  return (
    <div ref={rootRef} className={`relative inline-flex ${className}`}>
      <div className="inline-flex rounded-xl shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            onManual();
          }}
          className={`bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white font-semibold flex items-center justify-center gap-1.5 cursor-pointer ${
            tall
              ? 'px-6 py-3 min-h-[46px] text-sm'
              : 'px-3.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm'
          }`}
        >
          <Plus size={tall ? 18 : 16} />
          <span>{t('devices.addDevice')}</span>
        </button>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={`bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white border-l border-orange-400/70 cursor-pointer flex items-center justify-center ${
            tall ? 'px-3 min-h-[46px]' : 'px-2 sm:px-2.5'
          }`}
        >
          <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-30 min-w-[220px] py-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-[0_8px_28px_rgba(15,23,42,0.12)] dark:shadow-2xl overflow-hidden"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onManual();
            }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-left"
          >
            <Plus size={16} className="text-slate-400 dark:text-slate-500" />
            {t('devices.addManual')}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onScan();
            }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-orange-50 dark:hover:bg-orange-950/40 hover:text-orange-700 dark:hover:text-orange-300 cursor-pointer text-left"
          >
            <Radar size={16} className="text-orange-600 dark:text-orange-400" />
            {t('devices.scanNetwork')}
          </button>
        </div>
      )}
    </div>
  );
};
