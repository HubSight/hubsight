import React, { useState } from 'react';
import {
  Compass,
  Check,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  Copy,
} from '@/components/icons';
import type { DeviceFormData } from '../../types/device';
import type { ONVIFProbeResult } from '@hubsight/sdk';
import { api } from '../../api/client';
import { useTranslation } from '../../i18n';

export interface DeviceOnvifTabProps {
  formData: DeviceFormData;
  onChange: (patch: Partial<DeviceFormData>) => void;
  isStreaming?: boolean;
}

export const DeviceOnvifTab: React.FC<DeviceOnvifTabProps> = ({
  formData,
  onChange,
  isStreaming = false,
}) => {
  const { t } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<ONVIFProbeResult | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);

  // Auto copy credentials from builder if available
  const handleCopyFromRtsp = () => {
    onChange({
      onvif_username: formData.builderUser || formData.onvif_username || '',
      onvif_password: formData.builderPass || formData.onvif_password || '',
    });
  };

  // Perform ONVIF Probe handshake
  const handleProbe = async () => {
    // Determine target host IP
    const host =
      formData.builderIp ||
      formData.host.replace(/^rtsp:\/\/(?:[^@]+@)?([^:/]+).*/, '$1') ||
      '';
    if (!host) {
      setProbeError(t('device.onvifProbeFailed') + ' (Thiếu IP thiết bị)');
      return;
    }

    setProbing(true);
    setProbeError(null);
    setProbeResult(null);

    try {
      const res = await api.cameras.probeOnvif({
        host,
        port: Number(formData.onvif_port) || 80,
        username: formData.onvif_username || '',
        password: formData.onvif_password || '',
      });

      setProbeResult(res);
    } catch (err: any) {
      const errorMsg =
        err?.response?.data?.error ||
        err?.message ||
        t('device.onvifProbeFailed');
      setProbeError(errorMsg);
    } finally {
      setProbing(false);
    }
  };

  // Apply probed results into camera configuration
  const handleApplyProbed = () => {
    if (!probeResult) return;
    const patch: Partial<DeviceFormData> = {
      onvif_enabled: true,
      onvif_ptz_supported: probeResult.has_ptz,
      onvif_profile_token: probeResult.main_profile_token || undefined,
    };

    if (probeResult.main_stream_uri) {
      patch.host = probeResult.main_stream_uri;
      patch.isManualUrl = true;
    }

    onChange(patch);
  };

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="flex items-start gap-3 p-3.5 bg-orange-50 dark:bg-orange-950/30 border border-slate-200 dark:border-slate-800 rounded-2xl">
        <div className="p-2 rounded-xl bg-orange-600 text-white shrink-0 shadow-xs">
          <Compass size={20} />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
            {t('device.onvifSettingsTitle')}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('device.onvifSettingsSubtitle')}
          </p>
        </div>
      </div>

      {/* Enable ONVIF Master Switch */}
      <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-xl">
        <div>
          <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
            {t('device.onvifEnable')}
          </label>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('device.onvifEnableDesc')}
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer shrink-0">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={Boolean(formData.onvif_enabled)}
            onChange={(e) => onChange({ onvif_enabled: e.target.checked })}
          />
          <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 dark:after:border-slate-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
        </label>
      </div>

      {formData.onvif_enabled && (
        <div className="space-y-4">
          {/* Quick Actions & Credential Setup */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              {t('devices.tabOnvif')}
            </span>
            {(formData.builderUser || formData.builderPass) && (
              <button
                type="button"
                onClick={handleCopyFromRtsp}
                className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 dark:text-orange-400 hover:underline cursor-pointer"
              >
                <Copy size={12} />
                {t('device.onvifCopyCreds')}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* ONVIF Port */}
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('device.onvifPort')}
              </label>
              <input
                type="number"
                value={formData.onvif_port ?? 80}
                onChange={(e) =>
                  onChange({ onvif_port: Number(e.target.value) || 80 })
                }
                disabled={isStreaming}
                className="input-field w-full text-sm font-mono"
                placeholder="80"
              />
              <p className="text-[11px] text-slate-400 mt-0.5">
                80, 8080, 8000, 5000
              </p>
            </div>

            {/* ONVIF Username */}
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('device.onvifUsername')}
              </label>
              <input
                type="text"
                value={formData.onvif_username || ''}
                onChange={(e) => onChange({ onvif_username: e.target.value })}
                className="input-field w-full text-sm"
                placeholder="admin"
                autoComplete="off"
              />
            </div>

            {/* ONVIF Password */}
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('device.onvifPassword')}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.onvif_password || ''}
                  onChange={(e) => onChange({ onvif_password: e.target.value })}
                  className="input-field w-full text-sm pr-9"
                  placeholder="••••••••"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
          </div>

          {/* Probe & Auto-Detect Trigger Button */}
          <div className="pt-1">
            <button
              type="button"
              onClick={handleProbe}
              disabled={probing}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600/10 hover:bg-orange-600/20 text-orange-600 dark:text-orange-400 border border-orange-500/30 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
            >
              {probing ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  {t('device.onvifProbing')}
                </>
              ) : (
                <>
                  <Compass size={14} />
                  {t('device.onvifProbeBtn')}
                </>
              )}
            </button>
          </div>

          {/* Probe Error Alert */}
          {probeError && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">{t('device.onvifProbeFailed')}</span>
                <p className="mt-0.5 opacity-90">{probeError}</p>
              </div>
            </div>
          )}

          {/* Probe Success Box */}
          {probeResult && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-900 dark:text-emerald-200 text-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Check size={16} className="text-emerald-600 dark:text-emerald-400" />
                  <span className="font-bold text-emerald-800 dark:text-emerald-300">
                    {t('device.onvifProbeSuccess')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleApplyProbed}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-xs text-xs transition-colors cursor-pointer"
                >
                  {t('device.onvifApplyConfig')}
                </button>
              </div>

              {/* Hardware Info Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 text-[11px] border-t border-emerald-500/20">
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">{t('device.onvifManufacturer')}</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {probeResult.device_info.manufacturer || 'Unknown'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">{t('device.onvifModel')}</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {probeResult.device_info.model || 'Unknown'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">{t('device.onvifFirmware')}</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200 truncate block" title={probeResult.device_info.firmware_version}>
                    {probeResult.device_info.firmware_version || 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">PTZ</span>
                  <span
                    className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      probeResult.has_ptz
                        ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300'
                        : 'bg-slate-500/20 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {probeResult.has_ptz ? t('device.onvifHasPtz') : t('device.onvifNoPtz')}
                  </span>
                </div>
              </div>

              {/* Discovered RTSP URL */}
              {probeResult.main_stream_uri && (
                <div className="pt-1">
                  <span className="text-slate-500 dark:text-slate-400 block mb-1">RTSP Stream URI:</span>
                  <code className="block p-1.5 bg-black/10 dark:bg-black/40 rounded text-[11px] font-mono break-all text-slate-700 dark:text-slate-300">
                    {probeResult.main_stream_uri}
                  </code>
                </div>
              )}
            </div>
          )}

          {/* PTZ Supported Toggle */}
          <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-xl">
            <div>
              <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
                {t('device.onvifPtzSupported')}
              </label>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t('device.onvifPtzSupportedDesc')}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={Boolean(formData.onvif_ptz_supported)}
                onChange={(e) =>
                  onChange({ onvif_ptz_supported: e.target.checked })
                }
              />
              <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 dark:after:border-slate-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
            </label>
          </div>

          {/* ONVIF Profile Token (Optional Customization) */}
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('device.onvifProfileToken')}
            </label>
            <input
              type="text"
              value={formData.onvif_profile_token || ''}
              onChange={(e) =>
                onChange({ onvif_profile_token: e.target.value })
              }
              className="input-field w-full text-sm font-mono"
              placeholder="Profile_1"
            />
            <p className="text-[11px] text-slate-400 mt-0.5">
              {t('device.onvifProfileTokenDesc')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
