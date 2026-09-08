import React, { useState } from 'react';
import { Pencil, Play, Square, Trash2, RotateCw, Copy, Check } from '@/components/icons';
import type { DeviceType } from '../../types/device';
import { BRAND_PRESETS, getBrandBadgeColor } from '../../constants/devicePresets';
import { useTranslation } from '../../i18n';

export interface DeviceCardProps {
  device: DeviceType;
  onEdit: (device: DeviceType) => void;
  onDelete: (id: string) => void;
  onStop: (device: DeviceType) => void;
  onStart: (device: DeviceType) => void;
  onRestart: (device: DeviceType) => void;
  isToggling?: boolean;
}

export const DeviceCard: React.FC<DeviceCardProps> = ({
  device,
  onEdit,
  onDelete,
  onStop,
  onStart,
  onRestart,
  isToggling = false,
}) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const brandPreset = BRAND_PRESETS.find((b) => b.id === device.brand);
  const isStopped = Boolean(device.is_stopped);

  const handleCopyUrl = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (device.host) {
      navigator.clipboard.writeText(device.host);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div
      className={`bg-white border rounded-2xl p-4 sm:p-5 transition-all shadow-2xs hover:shadow-xs flex flex-col justify-between ${
        isStopped ? 'border-slate-200/80 opacity-85' : 'border-slate-200/90 hover:border-slate-300'
      }`}
    >
      <div>
        {/* Row 1: Camera Name & Actions Toolbar */}
        <div className="flex items-center justify-between gap-2.5 min-w-0 mb-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                isStopped
                  ? 'bg-slate-400 ring-2 ring-slate-200'
                  : device.is_active
                  ? 'bg-emerald-500 ring-2 ring-emerald-100 shadow-xs'
                  : 'bg-rose-500 ring-2 ring-rose-100'
              }`}
              title={isStopped ? t('devices.stoppedBadge') : device.is_active ? 'Live' : 'Offline'}
            />
            <h3
              className="font-bold text-sm sm:text-base text-slate-800 truncate tracking-tight"
              title={device.name}
            >
              {device.name}
            </h3>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-0.5 shrink-0 bg-slate-50 border border-slate-200/80 p-0.5 rounded-xl">
            {isStopped ? (
              <button
                onClick={() => onStart(device)}
                disabled={isToggling}
                className="w-7.5 h-7.5 rounded-lg flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:bg-white active:scale-95 transition-all cursor-pointer disabled:opacity-40"
                title={t('devices.startDevice')}
                aria-label={t('devices.startDevice')}
              >
                <Play size={14} />
              </button>
            ) : (
              <>
                <button
                  onClick={() => onRestart(device)}
                  disabled={isToggling}
                  className="w-7.5 h-7.5 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-white active:scale-95 transition-all cursor-pointer disabled:opacity-40"
                  title={t('devices.restartDevice')}
                  aria-label={t('devices.restartDevice')}
                >
                  <RotateCw size={13} />
                </button>
                <button
                  onClick={() => onStop(device)}
                  disabled={isToggling}
                  className="w-7.5 h-7.5 rounded-lg flex items-center justify-center text-slate-400 hover:text-amber-600 hover:bg-white active:scale-95 transition-all cursor-pointer disabled:opacity-40"
                  title={t('devices.stopDevice')}
                  aria-label={t('devices.stopDevice')}
                >
                  <Square size={12} fill="currentColor" />
                </button>
              </>
            )}
            <button
              onClick={() => onEdit(device)}
              className="w-7.5 h-7.5 rounded-lg flex items-center justify-center text-slate-400 hover:text-orange-600 hover:bg-white active:scale-95 transition-all cursor-pointer"
              title={t('devices.editDevice')}
              aria-label={t('devices.editDevice')}
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={() => onDelete(device.id)}
              className="w-7.5 h-7.5 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-white active:scale-95 transition-all cursor-pointer"
              title={t('devices.deleteDevice')}
              aria-label={t('devices.deleteDevice')}
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* Row 2: Status & Brand Badges (Full width, never squeezed by action buttons) */}
        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold tracking-wide ${getBrandBadgeColor(
              device.brand
            )}`}
          >
            {brandPreset ? brandPreset.name : device.brand || 'Generic'}
          </span>
          {isStopped ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
              {t('devices.stoppedBadge')}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {device.is_active ? 'Live' : 'Offline'}
            </span>
          )}
          {device.enable_ai && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
              AI Active
            </span>
          )}
        </div>

        {/* Row 3: RTSP URL with Copy Button */}
        <div className="group/url relative text-xs text-slate-600 font-mono bg-slate-50 border border-slate-200/80 p-2.5 rounded-xl break-all mb-3 flex items-center justify-between gap-2">
          <span className="min-w-0 flex-1 select-all leading-relaxed">{device.host}</span>
          <button
            type="button"
            onClick={handleCopyUrl}
            className="shrink-0 p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
            title={copied ? t('common.copied') : t('common.copy')}
          >
            {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
          </button>
        </div>

        {/* Row 4: Configuration Badges */}
        <div className="flex flex-wrap gap-1.5 mb-4 text-[11px]">
          {/* NVR Mode Badge */}
          {device.nvr_mode === 'disabled' ? (
            <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md border border-slate-200 font-medium">
              NVR: {t('device.nvrModeDisabled')}
            </span>
          ) : device.nvr_mode === 'full' ? (
            <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md border border-amber-200 font-medium">
              NVR: 24/7 ({device.record_quality === 'hd' ? '1080p' : '720p'})
            </span>
          ) : device.nvr_mode === 'aor' ? (
            <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md border border-indigo-200 font-medium">
              NVR: AOR (1/30 FPS)
            </span>
          ) : (
            <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md border border-emerald-200 font-medium">
              NVR: Event ({device.record_quality === 'hd' ? '1080p' : '720p'})
            </span>
          )}

          <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md border border-slate-200 font-medium">
            {t('device.segmentLabel', { min: (device.segment_duration || 1800) / 60 })}
          </span>
          <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md border border-slate-200 font-medium">
            {t('device.codecLabel', { codec: device.video_codec === 'copy' ? t('devices.copyCpu') : device.video_codec })}
          </span>
          {device.audio_mode === 'disabled' ? (
            <span className="bg-rose-50 text-rose-600 px-2 py-0.5 rounded-md border border-rose-200 font-medium">
              {t('devices.muteAudio')}
            </span>
          ) : (
            <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md border border-emerald-200 font-medium">
              {t('device.audioLabel', { audio: device.audio_mode === 'auto' ? t('devices.autoDetect') : device.audio_mode })}
            </span>
          )}
          {device.extra_args && (
            <span
              className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md border border-blue-200 font-mono text-[10px]"
              title={device.extra_args}
            >
              {t('devices.customFfmpeg')}
            </span>
          )}
        </div>
      </div>

      {/* Row 5: Footer */}
      <div className="pt-3 border-t border-slate-100 text-xs text-slate-400 flex items-center justify-between font-mono text-[11px]">
        <span title={device.id} className="truncate max-w-[180px]">ID: {device.id}</span>
        <span className="shrink-0">{new Date(device.created_at).toLocaleDateString()}</span>
      </div>
    </div>
  );
};

// Backward compatibility alias
export const CameraCard = DeviceCard;
export type CameraCardProps = DeviceCardProps;
