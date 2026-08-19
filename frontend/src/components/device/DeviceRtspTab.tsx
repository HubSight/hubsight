import React from 'react';
import { Check } from 'lucide-react';
import type { DeviceFormData } from '../../types/device';
import { updateRtspUrlPort } from '../../constants/devicePresets';

export interface DeviceRtspTabProps {
  formData: DeviceFormData;
  onChange: (patch: Partial<DeviceFormData>) => void;
}

const RTSP_TRANSPORTS = [
  {
    id: 'auto',
    label: 'Auto (Recommended)',
    desc: 'Automatic protocol negotiation between device and server.'
  },
  {
    id: 'tcp',
    label: 'TCP',
    desc: 'Prevents packet loss; delivers stable video without artifacts.'
  },
  {
    id: 'udp',
    label: 'UDP',
    desc: 'Lower latency, but frames may drop on unstable networks.'
  }
];

export const DeviceRtspTab: React.FC<DeviceRtspTabProps> = ({ formData, onChange }) => {
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
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Transport Protocol (RTSP Transport)
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {RTSP_TRANSPORTS.map((t) => (
            <div
              key={t.id}
              onClick={() => onChange({ rtspTransport: t.id })}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                formData.rtspTransport === t.id
                  ? 'border-orange-500 bg-orange-50/50 text-orange-950 ring-1 ring-orange-500 shadow-sm'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between font-semibold text-sm mb-1">
                {t.label}
                {formData.rtspTransport === t.id && <Check size={16} className="text-orange-600" />}
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">{t.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Default RTSP Port</label>
        <input
          type="number"
          value={formData.rtspPort}
          onChange={(e) => handlePortChange(e.target.value)}
          className="input-field w-full"
          placeholder="554"
        />
        <p className="text-xs text-slate-400 mt-1">Default port is typically 554 or 8554.</p>
      </div>
    </div>
  );
};

// Backward compatibility alias
export const CameraRtspTab = DeviceRtspTab;
export type CameraRtspTabProps = DeviceRtspTabProps;
