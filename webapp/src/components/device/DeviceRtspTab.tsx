import React from 'react';
import type { DeviceFormData } from '../../types/device';
import { updateRtspUrlPort } from '../../constants/devicePresets';
import { useTranslation } from '../../i18n';

export interface DeviceRtspTabProps {
  formData: DeviceFormData;
  onChange: (patch: Partial<DeviceFormData>) => void;
  isStreaming?: boolean;
}

export const DeviceRtspTab: React.FC<DeviceRtspTabProps> = ({ formData, onChange, isStreaming = false }) => {
  const { t } = useTranslation();

  const handlePortChange = (val: string) => {
    const newPort = Number(val) || 554;
    const patch: Partial<DeviceFormData> = {
      rtspPort: newPort,
      builderPort: newPort
    };
    if (formData.isManualUrl && formData.host) {
      patch.host = updateRtspUrlPort(formData.host, newPort);
    }
    onChange(patch);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('device.defaultRtspPort')}</label>
        <input
          type="number"
          value={formData.rtspPort}
          onChange={(e) => handlePortChange(e.target.value)}
          disabled={isStreaming}
          className={`input-field w-full ${isStreaming ? 'bg-slate-100 text-slate-500' : ''}`}
          placeholder="554"
        />
        <p className="text-xs text-slate-400 mt-1">{t('device.defaultRtspPortDesc')}</p>
      </div>
    </div>
  );
};

// Backward compatibility alias
export const CameraRtspTab = DeviceRtspTab;
export type CameraRtspTabProps = DeviceRtspTabProps;
