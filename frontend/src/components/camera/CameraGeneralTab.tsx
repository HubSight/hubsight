import React from 'react';
import type { CameraFormData } from '../../types/camera';
import { BRAND_PRESETS } from '../../constants/cameraPresets';
import { CameraBrandDropdown } from './CameraBrandDropdown';

interface CameraGeneralTabProps {
  formData: CameraFormData;
  onChange: (patch: Partial<CameraFormData>) => void;
}

export const CameraGeneralTab: React.FC<CameraGeneralTabProps> = ({ formData, onChange }) => {
  const selectedPreset =
    BRAND_PRESETS.find((b) => b.id === formData.brand) || BRAND_PRESETS[0];

  const handleBrandSelect = (newBrand: string) => {
    const preset = BRAND_PRESETS.find((b) => b.id === newBrand);
    onChange({
      brand: newBrand,
      builderPort: preset ? preset.defaultPort : formData.builderPort,
      rtspPort: preset ? preset.defaultPort : formData.rtspPort,
      builderUser: preset ? preset.defaultUser : formData.builderUser
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Camera Name</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="input-field w-full"
          placeholder="e.g. Front Door, Living Room, Backyard..."
          required
        />
      </div>

      <CameraBrandDropdown selectedBrand={formData.brand} onSelectBrand={handleBrandSelect} />

      {/* Friendly URL Builder or Manual Input Toggle */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3.5">
        <div className="flex justify-between items-center">
          <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
            {formData.isManualUrl
              ? 'Manual RTSP URL Entry'
              : `Standard URL Builder for ${selectedPreset.name}`}
          </span>
          <button
            type="button"
            onClick={() => onChange({ isManualUrl: !formData.isManualUrl })}
            className="text-xs text-orange-600 hover:text-orange-700 font-medium underline cursor-pointer"
          >
            {formData.isManualUrl ? '← Use Parameter Builder' : 'Direct URL Edit →'}
          </button>
        </div>

        {!formData.isManualUrl ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                IP Address / Host
              </label>
              <input
                type="text"
                value={formData.builderIp}
                onChange={(e) => onChange({ builderIp: e.target.value })}
                className="input-field w-full text-sm"
                placeholder="192.168.1.100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">RTSP Port</label>
              <input
                type="number"
                value={formData.builderPort}
                onChange={(e) => {
                  const p = Number(e.target.value);
                  onChange({ builderPort: p, rtspPort: p });
                }}
                className="input-field w-full text-sm"
                placeholder="554"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Username</label>
              <input
                type="text"
                value={formData.builderUser}
                onChange={(e) => onChange({ builderUser: e.target.value })}
                className="input-field w-full text-sm"
                placeholder="admin"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Password</label>
              <input
                type="password"
                value={formData.builderPass}
                onChange={(e) => onChange({ builderPass: e.target.value })}
                className="input-field w-full text-sm"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Channel Number
              </label>
              <input
                type="number"
                min="1"
                max="64"
                value={formData.builderChannel}
                onChange={(e) => onChange({ builderChannel: Number(e.target.value) || 1 })}
                className="input-field w-full text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Stream Type</label>
              <div className="grid grid-cols-2 gap-1 bg-white p-1 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => onChange({ builderIsSub: false })}
                  className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    !formData.builderIsSub
                      ? 'bg-orange-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Main Stream
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ builderIsSub: true })}
                  className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    formData.builderIsSub
                      ? 'bg-orange-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Sub Stream
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Complete RTSP URL</label>
          <input
            type="text"
            value={formData.host}
            onChange={(e) => onChange({ host: e.target.value })}
            readOnly={!formData.isManualUrl}
            className={`input-field w-full font-mono text-xs ${
              !formData.isManualUrl ? 'bg-slate-100 text-slate-600 cursor-not-allowed' : ''
            }`}
            placeholder="rtsp://admin:pass@192.168.1.100:554/stream"
            required
          />
        </div>
      </div>
    </div>
  );
};
