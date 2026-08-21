import React from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { DeviceType } from '../../types/device';
import { BRAND_PRESETS, getBrandBadgeColor } from '../../constants/devicePresets';
import { useTranslation } from '../../i18n';

export interface DeviceCardProps {
  device: DeviceType;
  onEdit: (device: DeviceType) => void;
  onDelete: (id: number) => void;
}

export const DeviceCard: React.FC<DeviceCardProps> = ({ device, onEdit, onDelete }) => {
  const { t } = useTranslation();
  const brandPreset = BRAND_PRESETS.find((b) => b.id === device.brand);

  return (
    <div className="bg-white border border-slate-200/90 p-4 sm:p-5 hover:border-slate-300 transition-all shadow-sm flex flex-col justify-between">
      <div>
        <div className="flex justify-between items-start mb-3 gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`w-3 h-3 rounded-full shrink-0 ${
                device.is_active ? 'bg-green-500 shadow-sm' : 'bg-red-500'
              }`}
            />
            <div className="min-w-0">
              <h3 className="font-bold text-base sm:text-lg text-slate-800 truncate">{device.name}</h3>
              <span
                className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold mt-0.5 ${getBrandBadgeColor(
                  device.brand
                )}`}
              >
                {brandPreset ? brandPreset.name : device.brand || 'Generic'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onEdit(device)}
              className="text-slate-400 hover:text-orange-600 active:text-orange-700 transition-colors w-9 h-9 rounded-xl hover:bg-orange-50 active:bg-orange-100 flex items-center justify-center cursor-pointer touch-manipulation"
              title={t('devices.editDevice')}
              aria-label={t('devices.editDevice')}
            >
              <Pencil size={17} />
            </button>
            <button
              onClick={() => onDelete(device.id)}
              className="text-slate-400 hover:text-red-600 active:text-red-700 transition-colors w-9 h-9 rounded-xl hover:bg-red-50 active:bg-red-100 flex items-center justify-center cursor-pointer touch-manipulation"
              title={t('devices.deleteDevice')}
              aria-label={t('devices.deleteDevice')}
            >
              <Trash2 size={17} />
            </button>
          </div>
        </div>

        <div className="text-xs text-slate-600 font-mono bg-slate-50 border border-slate-200 p-2.5 rounded-lg break-all mb-3">
          {device.host}
        </div>

        <div className="flex flex-wrap gap-1.5 mb-4 text-[11px]">
          <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
            Segment: {(device.segment_duration || 1800) / 60}m
          </span>
          <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
            Codec: {device.video_codec === 'copy' ? t('devices.copyCpu') : device.video_codec}
          </span>
          {device.audio_mode === 'disabled' ? (
            <span className="bg-red-50 text-red-600 px-2 py-0.5 rounded border border-red-200">
              {t('devices.muteAudio')}
            </span>
          ) : (
            <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200">
              Audio: {device.audio_mode === 'auto' ? t('devices.autoDetect') : device.audio_mode}
            </span>
          )}
          {device.extra_args && (
            <span
              className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded border border-blue-200 font-mono"
              title={device.extra_args}
            >
              {t('devices.customFfmpeg')}
            </span>
          )}
        </div>
      </div>

      <div className="pt-3 border-t border-slate-100 text-xs text-slate-400 flex justify-between">
        <span>ID: #{device.id}</span>
        <span>{new Date(device.created_at).toLocaleDateString()}</span>
      </div>
    </div>
  );
};

// Backward compatibility alias
export const CameraCard = DeviceCard;
export type CameraCardProps = DeviceCardProps;
