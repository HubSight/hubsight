import React, { useState } from 'react';
import { useAppLock } from '../../context/AppLockContext';
import { useTimezone, TIMEZONE_OPTIONS } from '../../context/TimezoneContext';
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
  Smartphone,
  Globe,
  Bell,
  ShieldCheck,
  RotateCw,
} from 'lucide-react';
import { isPwa } from '../../utils/pwa';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import { TwoFactorSetupModal } from './TwoFactorSetupModal';
import { PasskeySettingsSection } from './PasskeySettingsSection';

interface AppSettingsModalProps {
  onClose: () => void;
}

export const AppSettingsModal: React.FC<AppSettingsModalProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const { timezone, setTimezone } = useTimezone();
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

  const { user, setUser } = useAuth();

  const [loadingBio, setLoadingBio] = useState(false);
  const [bioError, setBioError] = useState('');
  const [bioSuccess, setBioSuccess] = useState('');
  const [twoFactorModalMode, setTwoFactorModalMode] = useState<'setup' | 'regenerate' | 'disable' | null>(null);

  const handle2FARefresh = async () => {
    try {
      const updatedUser = await api.auth.me();
      setUser(updatedUser);
    } catch {
      /* ignore */
    }
  };

  const handleTogglePushPref = async (key: string, checked: boolean) => {
    if (!user) return;
    
    // Default to true if undefined
    const currentPrefs = user.push_preferences || {
      family: true,
      guest: true,
      stranger: true,
      system: true,
    };
    
    const newPrefs = {
      ...currentPrefs,
      [key]: checked,
    };
    // If toggling family, toggle guest as well for simplicity
    if (key === 'family') {
      newPrefs.guest = checked;
    }
    
    setUser({ ...user, push_preferences: newPrefs });

    try {
      await api.auth.setPreferences(newPrefs);
    } catch (err) {
      console.error('Failed to update push preferences', err);
    }
  };

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
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-0 md:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative w-full md:max-w-md bg-white md:border border-slate-200/90 rounded-none md:rounded-3xl shadow-2xl overflow-hidden z-10 flex flex-col h-full md:h-auto md:max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-5 pt-[max(env(safe-area-inset-top),1.25rem)] md:pt-5 pl-[max(env(safe-area-inset-left),1.5rem)] pr-[max(env(safe-area-inset-right),1.5rem)] md:px-6 border-b border-slate-100 bg-slate-50/50">
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
        <div className="pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-6 pl-[max(env(safe-area-inset-left),1.5rem)] pr-[max(env(safe-area-inset-right),1.5rem)] md:p-6 space-y-5 overflow-y-auto">
          {/* PWA Mode Info Badge */}
          <div
            className={`p-3 rounded-2xl border flex items-center gap-3 text-xs ${isRunningPwa
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

          {/* Setting: Timezone Preference */}
          <div className="p-4 bg-slate-50/80 border border-slate-200/80 rounded-2xl space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Globe size={16} className="text-orange-600 shrink-0" />
              <span>{t('settings.timezoneTitle')}</span>
            </div>
            <p className="text-xs text-slate-500">
              {t('settings.timezoneDesc')}
            </p>
            <div className="pt-1">
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 cursor-pointer shadow-2xs"
              >
                {TIMEZONE_OPTIONS.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Setting: Push Preferences */}
          <div className="p-4 bg-slate-50/80 border border-slate-200/80 rounded-2xl space-y-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Bell size={16} className="text-orange-600 shrink-0" />
                <span>{t('settings.pushTitle')}</span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {t('settings.pushSubtitle')}
              </p>
            </div>
            
            <div className="space-y-3 pt-1">
              {/* Family & Guests */}
              <div className="flex items-center justify-between">
                <div className="pr-3">
                  <label className="text-sm font-semibold text-slate-700 block">
                    {t('settings.pushFamily')}
                  </label>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {t('settings.pushFamilyDesc')}
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={user?.push_preferences?.family ?? true}
                    onChange={(e) => handleTogglePushPref('family', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-600"></div>
                </label>
              </div>
              
              {/* Strangers & Security Alerts */}
              <div className="flex items-center justify-between">
                <div className="pr-3">
                  <label className="text-sm font-semibold text-slate-700 block">
                    {t('settings.pushStranger')}
                  </label>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {t('settings.pushStrangerDesc')}
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={user?.push_preferences?.stranger ?? true}
                    onChange={(e) => handleTogglePushPref('stranger', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-600"></div>
                </label>
              </div>

              {/* System */}
              <div className="flex items-center justify-between">
                <div className="pr-3">
                  <label className="text-sm font-semibold text-slate-700 block">
                    {t('settings.pushSystem')}
                  </label>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {t('settings.pushSystemDesc')}
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={user?.push_preferences?.system ?? true}
                    onChange={(e) => handleTogglePushPref('system', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-600"></div>
                </label>
              </div>
            </div>
          </div>

          {/* Setting: Two-Factor Authentication (TOTP 2FA) */}
          <div className="p-4 bg-slate-50/80 border border-slate-200/80 rounded-2xl space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <ShieldCheck size={16} className="text-orange-600 shrink-0" />
                  <span>{t('settings.twoFactorTitle')}</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t('settings.twoFactorDesc')}
                </p>
              </div>
              <span
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0 ${
                  user?.two_factor_enabled
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}
              >
                {user?.two_factor_enabled
                  ? t('settings.twoFactorEnabled')
                  : t('settings.twoFactorDisabled')}
              </span>
            </div>

            <div className="pt-1 flex flex-wrap gap-2">
              {!user?.two_factor_enabled ? (
                <button
                  type="button"
                  onClick={() => setTwoFactorModalMode('setup')}
                  className="px-3.5 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                >
                  {t('settings.enable2faBtn')}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setTwoFactorModalMode('regenerate')}
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                  >
                    <RotateCw size={13} />
                    <span>{t('settings.regenRecoveryBtn')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTwoFactorModalMode('disable')}
                    className="px-3 py-1.5 bg-white hover:bg-red-50 border border-red-200 text-red-600 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                  >
                    {t('settings.disable2faBtn')}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Setting: Passkeys (FIDO2 / WebAuthn) */}
          <PasskeySettingsSection />

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
            className={`p-4 border rounded-2xl transition-all ${!appLockEnabled ? 'opacity-50 pointer-events-none bg-slate-50/40 border-slate-200/60' : 'bg-slate-50/80 border-slate-200/80'
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
                className={`relative inline-flex items-center shrink-0 ${!biometricSupported || loadingBio ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
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
            className={`space-y-2 p-4 bg-slate-50/80 border border-slate-200/80 rounded-2xl ${!appLockEnabled ? 'opacity-50 pointer-events-none' : ''
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
                  className={`py-2 px-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer text-center ${lockTimeout === opt.value
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

      {twoFactorModalMode && (
        <TwoFactorSetupModal
          mode={twoFactorModalMode}
          onClose={() => setTwoFactorModalMode(null)}
          onSuccess={handle2FARefresh}
        />
      )}
    </div>
  );
};
