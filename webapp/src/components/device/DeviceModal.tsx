import React, { useState, useEffect } from 'react';
import { Layers, Globe, Sliders, HardDrive, X } from '@/components/icons';
import type { DeviceFormData } from '../../types/device';
import { DeviceGeneralTab } from './DeviceGeneralTab';
import { DeviceNvrTab } from './DeviceNvrTab';
import { DeviceRtspTab } from './DeviceRtspTab';
import { DeviceFfmpegTab } from './DeviceFfmpegTab';
import { useTranslation } from '../../i18n';

export interface DeviceModalProps {
  isEditing: boolean;
  isStreaming?: boolean;
  formData: DeviceFormData;
  error: string;
  isSubmitting: boolean;
  onClose: () => void;
  onChange: (patch: Partial<DeviceFormData>) => void;
  onSubmit: (e: React.FormEvent) => void;
  onAddFfmpegTag: (tag: string) => void;
}

export const DeviceModal: React.FC<DeviceModalProps> = ({
  isEditing,
  isStreaming = false,
  formData,
  error,
  isSubmitting,
  onClose,
  onChange,
  onSubmit,
  onAddFfmpegTag
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'general' | 'nvr' | 'rtsp' | 'ffmpeg'>('general');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-0 sm:p-4 md:p-6">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <div className="relative bg-white border-0 sm:border border-slate-200/90 rounded-none sm:rounded-3xl w-full max-w-none sm:max-w-3xl lg:max-w-4xl overflow-hidden shadow-none sm:shadow-2xl h-dvh sm:h-auto sm:max-h-[92dvh] flex flex-col z-10">
        {/* Modal Header */}
        <div className="pt-[max(env(safe-area-inset-top),1rem)] sm:pt-5 pb-3.5 sm:pb-5 px-4 sm:px-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 bg-slate-50/80 shrink-0">
          <div className="flex items-start justify-between w-full sm:w-auto gap-2">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-800">
                {isEditing ? t('devices.editDeviceTitle') : t('devices.addDeviceTitle')}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {t('devices.modalSubtitle')}
              </p>
            </div>
            {/* Mobile Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="sm:hidden p-1.5 -mr-1 -mt-0.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
              aria-label={t('cancel')}
            >
              <X size={20} />
            </button>
          </div>

          {/* Tabs and Desktop Close Button */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="flex bg-slate-200/80 p-1 rounded-xl gap-1 w-full sm:w-auto overflow-x-auto custom-scrollbar shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('general')}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${activeTab === 'general'
                  ? 'bg-white text-orange-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                <Layers size={14} />
                {t('devices.tabGeneral')}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('nvr')}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${activeTab === 'nvr'
                  ? 'bg-white text-orange-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                <HardDrive size={14} />
                {t('devices.tabNvr')}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('rtsp')}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${activeTab === 'rtsp'
                  ? 'bg-white text-orange-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                <Globe size={14} />
                {t('devices.tabRtsp')}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('ffmpeg')}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${activeTab === 'ffmpeg'
                  ? 'bg-white text-orange-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                <Sliders size={14} />
                {t('devices.tabFfmpeg')}
              </button>
            </div>

            {/* Desktop Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="hidden sm:flex p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer shrink-0"
              aria-label={t('cancel')}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <form onSubmit={onSubmit} className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 md:p-6 flex flex-col">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2.5 rounded-xl mb-4 text-xs sm:text-sm font-medium">
              {error}
            </div>
          )}

          {activeTab === 'general' && (
            <DeviceGeneralTab formData={formData} onChange={onChange} isStreaming={isStreaming} />
          )}

          {activeTab === 'nvr' && (
            <DeviceNvrTab formData={formData} onChange={onChange} />
          )}

          {activeTab === 'rtsp' && (
            <DeviceRtspTab formData={formData} onChange={onChange} isStreaming={isStreaming} />
          )}

          {activeTab === 'ffmpeg' && (
            <DeviceFfmpegTab
              formData={formData}
              onChange={onChange}
              onAddFfmpegTag={onAddFfmpegTag}
            />
          )}

          {/* Modal Footer */}
          <div className="mt-auto pt-4 sm:pt-5 pb-[max(env(safe-area-inset-bottom),1rem)] sm:pb-0 border-t border-slate-100 flex flex-col-reverse sm:flex-row justify-end gap-2.5 sm:gap-3 shrink-0">
            <button
              type="button"
              className="btn btn-secondary w-full sm:w-auto px-6 py-2.5 text-sm font-semibold cursor-pointer"
              onClick={onClose}
              disabled={isSubmitting}
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              className="btn btn-primary w-full sm:w-auto px-6 py-2.5 text-sm font-semibold shadow-sm cursor-pointer"
              disabled={isSubmitting}
            >
              {isSubmitting ? t('devices.saving') : isEditing ? t('devices.updateDevice') : t('devices.saveDevice')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Backward compatibility alias
export const CameraModal = DeviceModal;
export type CameraModalProps = DeviceModalProps;
