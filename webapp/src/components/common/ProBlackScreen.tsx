import React from 'react';
import { VideoOff } from '@/components/icons';
import { useTranslation } from '../../i18n';

export interface ProBlackScreenProps {
  /** Title of the device / channel */
  title?: string;
  /** Subtitle / host address (e.g. '192.168.1.50' or 'RTSP 0 FPS') */
  subtitle?: string;
  /** Descriptive message */
  message?: string;
  /** Status badge text, defaults to multiview.deviceStoppedBadge ('TẠM DỪNG') */
  badgeText?: string;
  /** Variant: 'default' for large players/slots, 'compact' for dashboard grid cards */
  variant?: 'default' | 'compact';
  /** Optional custom action/buttons rendered at the bottom */
  children?: React.ReactNode;
  /** Extra container className */
  className?: string;
}

export const ProBlackScreen: React.FC<ProBlackScreenProps> = ({
  title,
  subtitle,
  message,
  badgeText,
  variant = 'default',
  children,
  className = '',
}) => {
  const { t } = useTranslation();

  if (variant === 'compact') {
    return (
      <div
        className={`relative w-full h-full flex flex-col items-center justify-center p-2.5 text-center select-none overflow-hidden bg-[#07090e] ${className}`}
      >
        {/* Subtle tactical grid / scanline pattern */}
        <div
          className="absolute inset-0 pointer-events-none opacity-25"
          style={{
            backgroundImage:
              'radial-gradient(rgba(148, 163, 184, 0.2) 1px, transparent 1px)',
            backgroundSize: '16px 16px',
          }}
        />
        {/* Vignette effect */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/60 pointer-events-none" />

        {/* Compact center card */}
        <div className="relative z-10 flex flex-col items-center w-full max-w-[240px] px-2.5 py-2 rounded-xl bg-slate-900/80 border border-slate-800/90 shadow-lg backdrop-blur-xs">
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="w-6 h-6 rounded-lg bg-red-500/15 border border-red-500/25 flex items-center justify-center text-red-400 shrink-0">
              <VideoOff size={13} strokeWidth={2} />
            </div>
            <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-950/90 border border-red-800/60 text-red-400 text-[9px] font-mono font-bold uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
              <span>{badgeText || t('multiview.deviceStoppedBadge')}</span>
            </div>
          </div>

          <p className="text-[11px] font-semibold text-slate-200 truncate w-full mb-0.5" title={title}>
            {title || t('multiview.deviceStopped')}
          </p>

          <div className="mt-1 pt-1 border-t border-slate-800/70 w-full flex items-center justify-between text-[9px] font-mono text-slate-400">
            <span className="truncate max-w-[120px]">{subtitle ? `HOST: ${subtitle}` : 'OFFLINE'}</span>
            <span className="text-red-400/90 font-semibold">{t('multiview.noSignal')}</span>
          </div>

          {children && <div className="mt-1.5 w-full">{children}</div>}
        </div>
      </div>
    );
  }

  // Default Variant (For MultiView slots, Playback VideoPlayer, Modal)
  return (
    <div
      className={`relative w-full h-full flex flex-col items-center justify-center p-4 text-center select-none overflow-hidden bg-[#07090e] ${className}`}
    >
      {/* Subtle radar / tactical grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-30"
        style={{
          backgroundImage:
            'radial-gradient(rgba(148, 163, 184, 0.2) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      />

      {/* Vignette effect */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/60 pointer-events-none" />

      {/* Center Content Card */}
      <div className="relative z-10 flex flex-col items-center max-w-[280px] sm:max-w-[340px] px-5 py-5 rounded-2xl bg-slate-900/70 border border-slate-800/90 shadow-2xl backdrop-blur-sm animate-fade-in text-center">
        {/* Pulsing Red Status Badge */}
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-950/80 border border-red-800/60 text-red-400 text-[10px] font-mono font-bold tracking-wider uppercase mb-3 shadow-inner">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span>{badgeText || t('multiview.deviceStoppedBadge')}</span>
        </div>

        {/* Glowing Icon Container */}
        <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mb-3 shadow-[0_0_24px_rgba(239,68,68,0.15)]">
          <VideoOff size={22} className="stroke-[1.75]" />
        </div>

        {/* Device Name */}
        {title && (
          <h4
            className="text-xs sm:text-sm font-bold text-slate-200 truncate w-full mb-1"
            title={title}
          >
            {title}
          </h4>
        )}

        {/* Description */}
        <p className="text-[11px] leading-relaxed text-slate-400 font-normal">
          {message || t('multiview.deviceStoppedDesc')}
        </p>

        {/* Tactical Stream Metadata Bar */}
        <div className="mt-3 pt-2.5 border-t border-slate-800/80 w-full flex items-center justify-between text-[10px] font-mono text-slate-500">
          <span className="truncate max-w-[160px]">
            {subtitle ? `HOST: ${subtitle}` : 'OFFLINE'}
          </span>
          <span className="text-red-400/90 font-semibold">{t('multiview.noSignal')}</span>
        </div>

        {children && <div className="mt-3 w-full">{children}</div>}
      </div>
    </div>
  );
};

export default ProBlackScreen;
