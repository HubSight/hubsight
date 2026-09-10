import React, { useState } from 'react';
import { Pencil, Play, Square, Trash2, RotateCw, Copy, Check, Loader2 } from '@/components/icons';
import type { DeviceType } from '../../types/device';
import { BRAND_PRESETS, getBrandBadgeColor } from '../../constants/devicePresets';
import { useTranslation } from '../../i18n';

export interface DeviceCardProps {
  device: DeviceType;
  onEdit: (device: DeviceType) => void;
  onClone: (device: DeviceType) => void;
  onDelete: (id: string) => void;
  onStop: (device: DeviceType) => void;
  onStart: (device: DeviceType) => void;
  onRestart: (device: DeviceType) => void;
  isToggling?: boolean;
  isCloning?: boolean;
}

export const DeviceCard: React.FC<DeviceCardProps> = ({
  device,
  onEdit,
  onClone,
  onDelete,
  onStop,
  onStart,
  onRestart,
  isToggling = false,
  isCloning = false,
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
      className={`bg-white dark:bg-slate-900 border rounded-2xl p-4 sm:p-5 transition-all shadow-2xs hover:shadow-xs flex flex-col justify-between ${
        isStopped ? 'border-slate-200/80 dark:border-slate-800 opacity-85' : 'border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
      }`}
    >
      <div>
        {/* Row 1: Camera Name & Actions Toolbar */}
        <div className="flex items-center justify-between gap-2.5 min-w-0 mb-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                isStopped
                  ? 'bg-slate-400 ring-2 ring-slate-200 dark:ring-slate-700'
                  : device.is_active
                  ? 'bg-emerald-500 ring-2 ring-emerald-100 dark:ring-emerald-950 shadow-xs'
                  : 'bg-rose-500 ring-2 ring-rose-100 dark:ring-rose-950'
              }`}
              title={isStopped ? t('devices.stoppedBadge') : device.is_active ? 'Live' : 'Offline'}
            />
            <h3
              className="font-bold text-sm sm:text-base text-slate-800 dark:text-slate-100 truncate tracking-tight"
              title={device.name}
            >
              {device.name}
            </h3>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-0.5 shrink-0 bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 p-0.5 rounded-xl">
            {isStopped ? (
              <button
                onClick={() => onStart(device)}
                disabled={isToggling}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:bg-white dark:hover:bg-slate-700 active:scale-95 transition-all cursor-pointer disabled:opacity-40"
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
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-white dark:hover:bg-slate-700 active:scale-95 transition-all cursor-pointer disabled:opacity-40"
                  title={t('devices.restartDevice')}
                  aria-label={t('devices.restartDevice')}
                >
                  <RotateCw size={14} />
                </button>
                <button
                  onClick={() => onStop(device)}
                  disabled={isToggling}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-amber-600 hover:bg-white dark:hover:bg-slate-700 active:scale-95 transition-all cursor-pointer disabled:opacity-40"
                  title={t('devices.stopDevice')}
                  aria-label={t('devices.stopDevice')}
                >
                  <Square size={12} />
                </button>
              </>
            )}
            <button
              onClick={() => onEdit(device)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-orange-600 hover:bg-white dark:hover:bg-slate-700 active:scale-95 transition-all cursor-pointer"
              title={t('devices.editDevice')}
              aria-label={t('devices.editDevice')}
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={() => onClone(device)}
              disabled={isCloning}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-violet-600 hover:bg-white dark:hover:bg-slate-700 active:scale-95 transition-all cursor-pointer disabled:opacity-40"
              title={t('devices.cloneDevice')}
              aria-label={t('devices.cloneDevice')}
            >
              {isCloning
                ? <Loader2 size={13} className="animate-spin" />
                : <Copy size={13} />}
            </button>
            <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-0.5 shrink-0" />
            <button
              onClick={() => onDelete(device.id)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 active:scale-95 transition-all cursor-pointer"
              title={t('devices.deleteDevice')}
              aria-label={t('devices.deleteDevice')}
            >
              <Trash2 size={14} />
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
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
              {t('devices.stoppedBadge')}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {device.is_active ? 'Live' : 'Offline'}
            </span>
          )}
          {device.enable_ai && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/40">
              AI Active
            </span>
          )}
        </div>

        {/* Row 3: RTSP URL with Copy Button */}
        <div className="group/url relative text-xs text-slate-600 dark:text-slate-300 font-mono bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 p-2.5 rounded-xl break-all mb-3 flex items-center justify-between gap-2">
          <span className="min-w-0 flex-1 select-all leading-relaxed">{device.host}</span>
          <button
            type="button"
            onClick={handleCopyUrl}
            className="shrink-0 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            title={copied ? t('common.copied') : t('common.copy')}
          >
            {copied ? <Check size={14} className="text-emerald-600 dark:text-emerald-400" /> : <Copy size={14} />}
          </button>
        </div>

        {/* Row 4: Configuration Badges */}
        <div className="flex flex-wrap gap-1.5 mb-4 text-[11px]">
          {/* NVR Mode Badge */}
          {device.nvr_mode === 'disabled' ? (
            <span className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 font-medium">
              NVR: {t('device.nvrModeDisabled')}
            </span>
          ) : device.nvr_mode === 'full' ? (
            <span className="bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800/40 font-medium">
              NVR: 24/7 ({device.record_quality === 'hd' ? '1080p' : '720p'})
            </span>
          ) : device.nvr_mode === 'aor' ? (
            <span className="bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 px-2 py-0.5 rounded-md border border-indigo-200 dark:border-indigo-800/40 font-medium">
              NVR: AOR (1/30 FPS)
            </span>
          ) : (
            <span className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800/40 font-medium">
              NVR: Event ({device.record_quality === 'hd' ? '1080p' : '720p'})
            </span>
          )}

          <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 font-medium">
            {t('device.segmentLabel', { min: (device.segment_duration || 1800) / 60 })}
          </span>
          <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 font-medium">
            {t('device.codecLabel', { codec: device.video_codec === 'copy' ? t('devices.copyCpu') : device.video_codec })}
          </span>
          {device.audio_mode === 'disabled' ? (
            <span className="bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 px-2 py-0.5 rounded-md border border-rose-200 dark:border-rose-800/40 font-medium">
              {t('devices.muteAudio')}
            </span>
          ) : (
            <span className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800/40 font-medium">
              {t('device.audioLabel', { audio: device.audio_mode === 'auto' ? t('devices.autoDetect') : device.audio_mode })}
            </span>
          )}
          {device.extra_args && (
            <span
              className="bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-800/40 font-mono text-[10px]"
              title={device.extra_args}
            >
              {t('devices.customFfmpeg')}
            </span>
          )}
        </div>
      </div>

      {/* Row 5: Footer */}
      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-400 dark:text-slate-500 flex items-center justify-between font-mono text-[11px]">
        <span title={device.id} className="truncate max-w-[180px]">ID: {device.id}</span>
        <span className="shrink-0">{new Date(device.created_at).toLocaleDateString()}</span>
      </div>
    </div>
  );
};

// Backward compatibility alias
export const CameraCard = DeviceCard;
export type CameraCardProps = DeviceCardProps;
