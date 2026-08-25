import React from 'react';
import { Info } from 'lucide-react';
import type { DeviceFormData } from '../../types/device';
import { BRAND_PRESETS, parseRtspUrl } from '../../constants/devicePresets';
import { DeviceBrandDropdown } from './DeviceBrandDropdown';
import { useTranslation } from '../../i18n';

export interface DeviceGeneralTabProps {
  formData: DeviceFormData;
  onChange: (patch: Partial<DeviceFormData>) => void;
}

export const DeviceGeneralTab: React.FC<DeviceGeneralTabProps> = ({ formData, onChange }) => {
  const { t } = useTranslation();

  const selectedPreset =
    BRAND_PRESETS.find((b) => b.id === formData.brand) || BRAND_PRESETS[0];

  const handleBrandSelect = (newBrand: string) => {
    const preset = BRAND_PRESETS.find((b) => b.id === newBrand);
    onChange({
      brand: newBrand,
      builderPort: preset ? preset.defaultPort : formData.builderPort,
      rtspPort: preset ? preset.defaultPort : formData.rtspPort,
      builderUser: formData.builderUser
    });
  };

  const handleManualUrlChange = (newUrl: string) => {
    const patch: Partial<DeviceFormData> = { host: newUrl };
    const parsed = parseRtspUrl(newUrl);
    if (parsed) {
      patch.rtspPort = parsed.port;
      patch.builderPort = parsed.port;
      if (parsed.ip) patch.builderIp = parsed.ip;
      if (parsed.user) patch.builderUser = parsed.user;
      if (parsed.pass) patch.builderPass = parsed.pass;
      if (parsed.channel !== undefined) patch.builderChannel = parsed.channel;
      if (parsed.isSub !== undefined) patch.builderIsSub = parsed.isSub;
    }
    onChange(patch);
  };

  const handleToggleManual = () => {
    const nextIsManual = !formData.isManualUrl;
    if (!nextIsManual && formData.host) {
      const parsed = parseRtspUrl(formData.host);
      if (parsed) {
        onChange({
          isManualUrl: false,
          builderIp: parsed.ip || formData.builderIp,
          builderPort: parsed.port || formData.builderPort,
          rtspPort: parsed.port || formData.rtspPort,
          builderUser: parsed.user || formData.builderUser,
          builderPass: parsed.pass || formData.builderPass,
          builderChannel: parsed.channel !== undefined ? parsed.channel : formData.builderChannel,
          builderIsSub: parsed.isSub !== undefined ? parsed.isSub : formData.builderIsSub
        });
        return;
      }
    }
    onChange({ isManualUrl: nextIsManual });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('device.displayName')}</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="input-field w-full"
          placeholder={t('device.displayNamePlaceholder')}
          required
        />
      </div>

      <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
        <div>
          <label className="block text-sm font-medium text-slate-800">{t('device.enableAi')}</label>
          <p className="text-[11px] text-slate-500 mt-0.5">{t('device.enableAiDesc')}</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={formData.enable_ai || false}
            onChange={(e) => onChange({ enable_ai: e.target.checked })}
          />
          <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-600"></div>
        </label>
      </div>

      {formData.enable_ai && (
        <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
          <div>
            <label className="block text-sm font-medium text-slate-800">{t('device.showBbox')}</label>
            <p className="text-[11px] text-slate-500 mt-0.5">{t('device.showBboxDesc')}</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={formData.show_bbox !== false}
              onChange={(e) => onChange({ show_bbox: e.target.checked })}
            />
            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-600"></div>
          </label>
        </div>
      )}

      <DeviceBrandDropdown selectedBrand={formData.brand} onSelectBrand={handleBrandSelect} />

      {/* URL Builder or Manual Input */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3.5">
        <div className="flex justify-between items-center">
          <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
            {formData.isManualUrl
              ? t('device.manualUrlEntry')
              : t('device.urlBuilderFor', { brand: selectedPreset.name })}
          </span>
          <button
            type="button"
            onClick={handleToggleManual}
            className="text-xs text-orange-600 hover:text-orange-700 font-medium underline cursor-pointer"
          >
            {formData.isManualUrl ? t('device.useParamBuilder') : t('device.directUrlEdit')}
          </button>
        </div>

        {!formData.isManualUrl && selectedPreset.hint && (
          <div className="flex items-start gap-2 p-2.5 bg-orange-50/70 border border-orange-200/80 rounded-lg text-xs text-orange-800">
            <Info size={15} className="text-orange-600 shrink-0 mt-0.5" />
            <span>{selectedPreset.hint}</span>
          </div>
        )}

        {!formData.isManualUrl ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                {t('device.ipAddress')}
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
              <label className="block text-xs font-medium text-slate-600 mb-1">{t('device.rtspPort')}</label>
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
              <label className="block text-xs font-medium text-slate-600 mb-1">
                {t('device.username')} <span className="text-slate-400 font-normal">{t('device.usernameOptional')}</span>
              </label>
              <input
                type="text"
                value={formData.builderUser}
                onChange={(e) => onChange({ builderUser: e.target.value })}
                className="input-field w-full text-sm"
                placeholder="e.g. admin"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                {t('device.password')} <span className="text-slate-400 font-normal">{t('device.passwordOptional')}</span>
              </label>
              <input
                type="password"
                value={formData.builderPass}
                onChange={(e) => onChange({ builderPass: e.target.value })}
                className="input-field w-full text-sm"
                placeholder={t('device.passwordPlaceholder')}
              />
            </div>
            {formData.brand === 'generic' ? (
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {t('device.rtspStreamPath')}
                </label>
                <input
                  type="text"
                  value={formData.builderPath ?? '/stream'}
                  onChange={(e) => onChange({ builderPath: e.target.value })}
                  className="input-field w-full text-sm font-mono"
                  placeholder="e.g. /stream, /live, /h264, /cam1..."
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  {t('device.rtspStreamPathDesc')}
                </p>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    {t('device.channelNumber')}
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
                  <label className="block text-xs font-medium text-slate-600 mb-1">{t('device.streamType')}</label>
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
                      {t('device.mainStream')}
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
                      {t('device.subStream')}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : null}

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">{t('device.completeRtspUrl')}</label>
          <input
            type="text"
            value={formData.host}
            onChange={(e) =>
              formData.isManualUrl
                ? handleManualUrlChange(e.target.value)
                : onChange({ host: e.target.value })
            }
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

// Backward compatibility alias
export const CameraGeneralTab = DeviceGeneralTab;
export type CameraGeneralTabProps = DeviceGeneralTabProps;
