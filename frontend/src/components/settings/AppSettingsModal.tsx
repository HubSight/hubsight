import React, { useState } from 'react';
import { useAppLock } from '../../context/AppLockContext';
import { useTranslation } from '../../i18n';
import {
  Shield,
  Fingerprint,
  Clock,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Lock,
  Smartphone
} from 'lucide-react';
import { isPwa } from '../../utils/pwa';

interface AppSettingsModalProps {
  onClose: () => void;
}

export const AppSettingsModal: React.FC<AppSettingsModalProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const {
    appLockEnabled,
    biometricEnabled,
    biometricSupported,
    lockTimeout,
    setAppLockEnabled,
    setLockTimeout,
    enableBiometricUnlock,
    disableBiometricUnlock,
    lockApp,
  } = useAppLock();

  const [loadingBio, setLoadingBio] = useState(false);
  const [bioError, setBioError] = useState('');
  const [bioSuccess, setBioSuccess] = useState('');

  const handleToggleBiometric = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const shouldEnable = e.target.checked;
    setBioError('');
    setBioSuccess('');

    if (shouldEnable) {
      setLoadingBio(true);
      try {
        const success = await enableBiometricUnlock();
        if (success) {
          setBioSuccess(t('settings.bioSuccess'));
        } else {
          setBioError(t('settings.bioFailed'));
        }
      } catch (err: unknown) {
        if (err instanceof Error) {
          setBioError(err.message || t('settings.bioCancelled'));
        } else {
          setBioError(t('settings.bioCancelled'));
        }
      } finally {
        setLoadingBio(false);
      }
    } else {
      disableBiometricUnlock();
      setBioSuccess(t('settings.bioDisabled'));
    }
  };

  const isRunningPwa = isPwa();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-md bg-white border border-slate-200/90 rounded-3xl shadow-2xl overflow-hidden z-10 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-50 border border-orange-200/60 flex items-center justify-center text-orange-600">
              <Shield size={20} />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-800">{t('settings.securityTitle')}</h3>
              <p className="text-xs text-slate-500">{t('settings.securitySubtitle')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* PWA Mode Info Badge */}
          <div
            className={`p-3 rounded-2xl border flex items-center gap-3 text-xs ${
              isRunningPwa
                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-800'
                : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}
          >
            <Smartphone size={18} className={isRunningPwa ? 'text-emerald-600 shrink-0' : 'text-slate-400 shrink-0'} />
            <div>
              <span className="font-semibold">
                {isRunningPwa ? t('settings.pwaActive') : t('settings.browserMode')}
              </span>
              <p className="text-[11px] opacity-80 mt-0.5">
                {isRunningPwa
                  ? t('settings.pwaDesc')
                  : t('settings.browserDesc')}
              </p>
            </div>
          </div>

          {/* Feedback Messages */}
          {bioSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs flex items-center gap-2 animate-fade-in">
              <CheckCircle2 size={16} className="shrink-0" />
              <span>{bioSuccess}</span>
            </div>
          )}

          {bioError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs flex items-center gap-2 animate-fade-in">
              <AlertCircle size={16} className="shrink-0" />
              <span>{bioError}</span>
            </div>
          )}

          {/* Setting 1: App Lock Toggle */}
          <div className="flex items-center justify-between p-4 bg-slate-50/80 border border-slate-200/80 rounded-2xl">
            <div className="pr-3">
              <label className="text-sm font-semibold text-slate-800 block">
                {t('settings.lockOnBackground')}
              </label>
              <p className="text-xs text-slate-500 mt-0.5">
                {t('settings.lockOnBackgroundDesc')}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={appLockEnabled}
                onChange={(e) => setAppLockEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
            </label>
          </div>

          {/* Setting 2: Biometric Unlock Toggle */}
          <div
            className={`p-4 border rounded-2xl transition-all ${
              !appLockEnabled ? 'opacity-50 pointer-events-none bg-slate-50/40 border-slate-200/60' : 'bg-slate-50/80 border-slate-200/80'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="pr-3">
                <div className="flex items-center gap-2">
                  <Fingerprint size={16} className="text-orange-600 shrink-0" />
                  <label className="text-sm font-semibold text-slate-800 block">
                    {t('settings.bioUnlock')}
                  </label>
                  {loadingBio && <Loader2 size={14} className="animate-spin text-orange-600" />}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {biometricSupported
                    ? t('settings.bioSupported')
                    : t('settings.bioNotSupported')}
                </p>
              </div>
              <label
                className={`relative inline-flex items-center shrink-0 ${
                  !biometricSupported || loadingBio ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                }`}
              >
                <input
                  type="checkbox"
                  disabled={!biometricSupported || loadingBio}
                  checked={biometricEnabled}
                  onChange={handleToggleBiometric}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
              </label>
            </div>
            {!biometricEnabled && appLockEnabled && (
              <p className="text-[11px] text-amber-700 bg-amber-50/80 border border-amber-200/60 p-2.5 rounded-xl mt-3">
                {t('settings.bioFallbackNote')}
              </p>
            )}
          </div>

          {/* Setting 3: Lock Timeout */}
          <div
            className={`space-y-2 p-4 bg-slate-50/80 border border-slate-200/80 rounded-2xl ${
              !appLockEnabled ? 'opacity-50 pointer-events-none' : ''
            }`}
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Clock size={16} className="text-slate-400" />
              <span>{t('settings.lockTimeout')}</span>
            </div>
            <p className="text-xs text-slate-500">
              {t('settings.lockTimeoutDesc')}
            </p>
            <div className="grid grid-cols-3 gap-2 pt-1">
              {[
                { label: t('settings.timeoutImmediate'), value: 0 },
                { label: t('settings.timeout1m'), value: 60 },
                { label: t('settings.timeout5m'), value: 300 },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setLockTimeout(opt.value)}
                  className={`py-2 px-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer text-center ${
                    lockTimeout === opt.value
                      ? 'bg-orange-600 text-white border-orange-600 shadow-sm'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Lock Now Button */}
          {appLockEnabled && (
            <button
              type="button"
              onClick={() => {
                onClose();
                lockApp();
              }}
              className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Lock size={14} />
              <span>{t('settings.lockNow')}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
