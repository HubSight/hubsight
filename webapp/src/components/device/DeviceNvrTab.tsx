import React from 'react';
import {
  HardDrive,
  Video,
  Zap,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Film,
  Sparkles
} from 'lucide-react';
import type { DeviceFormData } from '../../types/device';
import { useTranslation } from '../../i18n';

export interface DeviceNvrTabProps {
  formData: DeviceFormData;
  onChange: (patch: Partial<DeviceFormData>) => void;
}

export const DeviceNvrTab: React.FC<DeviceNvrTabProps> = ({ formData, onChange }) => {
  const { t } = useTranslation();

  const NVR_MODES = [
    {
      id: 'event' as const,
      title: t('device.nvrModeEvent'),
      badge: t('device.nvrModeEventBadge'),
      desc: t('device.nvrModeEventDesc'),
      icon: Zap,
      accentColor: 'border-emerald-500 bg-emerald-50/50 ring-1 ring-emerald-500',
      badgeColor: 'bg-emerald-100 text-emerald-700',
      iconColor: 'text-emerald-600',
    },
    {
      id: 'aor' as const,
      title: t('device.nvrModeAor'),
      badge: t('device.nvrModeAorBadge'),
      desc: t('device.nvrModeAorDesc'),
      icon: Sparkles,
      accentColor: 'border-indigo-500 bg-indigo-50/50 ring-1 ring-indigo-500',
      badgeColor: 'bg-indigo-100 text-indigo-700',
      iconColor: 'text-indigo-600',
    },
    {
      id: 'full' as const,
      title: t('device.nvrModeFull'),
      badge: t('device.nvrModeFullBadge'),
      desc: t('device.nvrModeFullDesc'),
      icon: Film,
      accentColor: 'border-amber-500 bg-amber-50/50 ring-1 ring-amber-500',
      badgeColor: 'bg-amber-100 text-amber-700',
      iconColor: 'text-amber-600',
    },
    {
      id: 'disabled' as const,
      title: t('device.nvrModeDisabled'),
      badge: t('device.nvrModeDisabledBadge'),
      desc: t('device.nvrModeDisabledDesc'),
      icon: HardDrive,
      accentColor: 'border-slate-400 bg-slate-100/70 ring-1 ring-slate-400',
      badgeColor: 'bg-slate-200 text-slate-700',
      iconColor: 'text-slate-500',
    },
  ];

  const QUALITY_OPTIONS = [
    {
      id: 'standard' as const,
      title: t('device.qualityStandard'),
      badge: t('device.qualityStandardBadge'),
      desc: t('device.qualityStandardDesc'),
      resolution: '1280x720 (15 FPS)',
    },
    {
      id: 'hd' as const,
      title: t('device.qualityHd'),
      badge: t('device.qualityHdBadge'),
      desc: t('device.qualityHdDesc'),
      resolution: '1920x1080 (30 FPS)',
    },
  ];

  const SEGMENT_DURATIONS = [
    { secs: 1800, label: t('device.seg30m') },
    { secs: 900, label: t('device.seg15m') },
    { secs: 600, label: t('device.seg10m') },
    { secs: 300, label: t('device.seg5m') },
    { secs: 60, label: t('device.seg1m') },
  ];

  const currentMode = formData.nvr_mode || 'event';
  const currentQuality = formData.record_quality || 'standard';

  return (
    <div className="space-y-5">
      {/* Tab Header Banner */}
      <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-3">
        <div className="p-2 bg-orange-100 text-orange-600 rounded-lg shrink-0 mt-0.5">
          <HardDrive size={18} />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-slate-800">{t('device.nvrSettingsTitle')}</h4>
          <p className="text-xs text-slate-500 mt-0.5">{t('device.nvrSettingsSubtitle')}</p>
        </div>
      </div>

      {/* AI Requirement Warning if Event Mode selected without AI */}
      {currentMode === 'event' && !formData.enable_ai && (
        <div className="flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 animate-fadeIn">
          <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold">{t('device.nvrAiNotice')}</span>
            <button
              type="button"
              onClick={() => onChange({ enable_ai: true })}
              className="ml-2 font-medium underline text-amber-900 hover:text-amber-950 cursor-pointer"
            >
              ({t('device.enableAi')} ngay)
            </button>
          </div>
        </div>
      )}

      {/* 1. NVR Recording Mode Selection */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2.5 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Video size={16} className="text-orange-600" />
            {t('device.nvrModeLabel')}
          </span>
          <span className="text-xs text-slate-400 font-normal">
            Mỗi camera có cài đặt độc lập
          </span>
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {NVR_MODES.map((mode) => {
            const Icon = mode.icon;
            const isSelected = currentMode === mode.id;

            return (
              <div
                key={mode.id}
                onClick={() => onChange({ nvr_mode: mode.id })}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${isSelected
                    ? `${mode.accentColor} shadow-sm`
                    : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <Icon size={16} className={isSelected ? mode.iconColor : 'text-slate-500'} />
                      <span className="font-semibold text-sm text-slate-800">{mode.title}</span>
                    </div>
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${mode.badgeColor}`}>
                      {mode.badge}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">{mode.desc}</p>
                </div>

                {isSelected && (
                  <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex items-center gap-1.5 text-[11px] font-medium text-slate-700">
                    <CheckCircle2 size={13} className={mode.iconColor} />
                    <span>Đang kích hoạt chế độ này</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Recording Video Quality Selection */}
      {currentMode !== 'disabled' && (
        <div className="pt-2 border-t border-slate-100">
          <label className="block text-sm font-medium text-slate-700 mb-2.5 flex items-center gap-1.5">
            <Sparkles size={16} className="text-orange-600" />
            {t('device.nvrQualityLabel')}
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {QUALITY_OPTIONS.map((opt) => {
              const isSelected = currentQuality === opt.id;

              return (
                <div
                  key={opt.id}
                  onClick={() => onChange({ record_quality: opt.id })}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${isSelected
                      ? 'border-orange-500 bg-orange-50/50 ring-1 ring-orange-500 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm text-slate-800">{opt.title}</span>
                    <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-[10px] font-bold rounded">
                      {opt.badge}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed mb-1.5">{opt.desc}</p>
                  <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-mono rounded">
                    {opt.resolution}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Segment Duration for Continuous/AOR modes */}
      {currentMode !== 'disabled' && (
        <div className="pt-2 border-t border-slate-100">
          <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-1.5">
            <Clock size={16} className="text-orange-600" />
            {t('device.segmentDuration')}
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {SEGMENT_DURATIONS.map((item) => (
              <button
                key={item.secs}
                type="button"
                onClick={() => onChange({ segmentDuration: item.secs })}
                className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${formData.segmentDuration === item.secs
                    ? 'bg-orange-600 text-white border-orange-600 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-400 mt-1.5">
            Thời lượng mỗi tệp video phân đoạn được cắt và đồng bộ lên S3/MinIO.
          </p>
        </div>
      )}
    </div>
  );
};

