import React, { useState, useEffect } from 'react';
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
  Sliders,
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

  const [activeTab, setActiveTab] = useState<'security' | 'notifications' | 'general'>('security');

  const [loadingBio, setLoadingBio] = useState(false);
  const [bioError, setBioError] = useState('');
  const [bioSuccess, setBioSuccess] = useState('');
  const [twoFactorModalMode, setTwoFactorModalMode] = useState<'setup' | 'regenerate' | 'disable' | null>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !twoFactorModalMode) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, twoFactorModalMode]);

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
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-0 sm:p-4 md:p-6 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <div className="relative w-full sm:max-w-3xl md:max-w-4xl lg:max-w-5xl bg-white border-0 sm:border border-slate-200/90 rounded-none sm:rounded-3xl shadow-none sm:shadow-2xl overflow-hidden z-10 flex flex-col h-dvh sm:h-[88vh] sm:max-h-[850px]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 pt-[max(env(safe-area-inset-top),1.25rem)] sm:pt-5 pl-[max(env(safe-area-inset-left),1.25rem)] pr-[max(env(safe-area-inset-right),1.25rem)] sm:px-7 border-b border-slate-100 bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-50 border border-orange-200/60 flex items-center justify-center text-orange-600 shadow-2xs">
              <Shield size={20} />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg text-slate-800 tracking-tight">
                {t('settings.securityTitle')}
              </h3>
              <p className="text-xs text-slate-500">
                {t('settings.securitySubtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label={t('close')}
          >
            <X size={18} />
          </button>
        </div>

        {/* Main Body with Left Sidebar on Desktop & Horizontal Tabs on Mobile */}
        <div className="flex flex-col sm:flex-row flex-1 min-h-0 overflow-hidden">
          {/* Navigation Sidebar */}
          <div className="sm:w-64 shrink-0 bg-slate-50/60 border-b sm:border-b-0 sm:border-r border-slate-100 p-2 sm:p-4 flex flex-row sm:flex-col gap-1 sm:gap-1.5 overflow-x-auto sm:overflow-y-auto scrollbar-none">
            {/* Tab 1: Security */}
            <button
              type="button"
              onClick={() => setActiveTab('security')}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl sm:rounded-2xl text-left text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap sm:whitespace-normal shrink-0 sm:shrink ${
                activeTab === 'security'
                  ? 'bg-white text-orange-700 border border-orange-200/80 shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100/70 hover:text-slate-800'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                  activeTab === 'security'
                    ? 'bg-orange-600 text-white'
                    : 'bg-slate-200/70 text-slate-600'
                }`}
              >
                <ShieldCheck size={16} />
              </div>
              <div className="hidden sm:block min-w-0">
                <span className="block font-bold truncate">{t('settings.tabSecurity')}</span>
                <span className="text-[11px] text-slate-400 font-normal block truncate">
                  2FA • Passkeys • Khóa
                </span>
              </div>
              <span className="sm:hidden font-bold">{t('settings.tabSecurity')}</span>
            </button>

            {/* Tab 2: Notifications */}
            <button
              type="button"
              onClick={() => setActiveTab('notifications')}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl sm:rounded-2xl text-left text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap sm:whitespace-normal shrink-0 sm:shrink ${
                activeTab === 'notifications'
                  ? 'bg-white text-orange-700 border border-orange-200/80 shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100/70 hover:text-slate-800'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                  activeTab === 'notifications'
                    ? 'bg-orange-600 text-white'
                    : 'bg-slate-200/70 text-slate-600'
                }`}
              >
                <Bell size={16} />
              </div>
              <div className="hidden sm:block min-w-0">
                <span className="block font-bold truncate">{t('settings.tabNotifications')}</span>
                <span className="text-[11px] text-slate-400 font-normal block truncate">
                  Cảnh báo • Phân loại
                </span>
              </div>
              <span className="sm:hidden font-bold">{t('settings.tabNotifications')}</span>
            </button>

            {/* Tab 3: General */}
            <button
              type="button"
              onClick={() => setActiveTab('general')}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl sm:rounded-2xl text-left text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap sm:whitespace-normal shrink-0 sm:shrink ${
                activeTab === 'general'
                  ? 'bg-white text-orange-700 border border-orange-200/80 shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100/70 hover:text-slate-800'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                  activeTab === 'general'
                    ? 'bg-orange-600 text-white'
                    : 'bg-slate-200/70 text-slate-600'
                }`}
              >
                <Sliders size={16} />
              </div>
              <div className="hidden sm:block min-w-0">
                <span className="block font-bold truncate">{t('settings.tabGeneral')}</span>
                <span className="text-[11px] text-slate-400 font-normal block truncate">
                  Múi giờ • Chế độ PWA
                </span>
              </div>
              <span className="sm:hidden font-bold">{t('settings.tabGeneral')}</span>
            </button>
          </div>

          {/* Right Content Pane */}
          <div className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto space-y-6 bg-white">
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

            {/* ── TAB 1: SECURITY & AUTHENTICATION ── */}
            {activeTab === 'security' && (
              <div className="space-y-6 animate-fade-in">
                <div>
                  <h4 className="text-sm sm:text-base font-bold text-slate-800 tracking-tight">
                    {t('settings.mfaSectionTitle')}
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {t('settings.passkeySubtitle')}
                  </p>
                </div>

                {/* Two-Factor Authentication Card */}
                <div className="p-5 bg-slate-50/80 border border-slate-200/80 rounded-2xl space-y-3.5 shadow-2xs">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                        <ShieldCheck size={18} className="text-orange-600 shrink-0" />
                        <span>{t('settings.twoFactorTitle')}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1 max-w-xl">
                        {t('settings.twoFactorDesc')}
                      </p>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold shrink-0 self-start sm:self-auto ${
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

                  <div className="pt-2 flex flex-wrap gap-2.5">
                    {!user?.two_factor_enabled ? (
                      <button
                        type="button"
                        onClick={() => setTwoFactorModalMode('setup')}
                        className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold shadow-2xs transition-all cursor-pointer"
                      >
                        {t('settings.enable2faBtn')}
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setTwoFactorModalMode('regenerate')}
                          className="px-3.5 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                        >
                          <RotateCw size={13} />
                          <span>{t('settings.regenRecoveryBtn')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setTwoFactorModalMode('disable')}
                          className="px-3.5 py-2 bg-white hover:bg-red-50 border border-red-200 text-red-600 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                        >
                          {t('settings.disable2faBtn')}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Passkeys Management Section */}
                <PasskeySettingsSection />

                {/* App Lock & Biometrics Section */}
                <div className="space-y-4 pt-2">
                  <div>
                    <h4 className="text-sm font-bold text-slate-800 tracking-tight">
                      {t('settings.lockOnBackground')}
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {t('settings.lockOnBackgroundDesc')}
                    </p>
                  </div>

                  {/* App Lock Toggle */}
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

                  {/* Biometric Unlock Toggle */}
                  <div
                    className={`p-4 border rounded-2xl transition-all ${
                      !appLockEnabled
                        ? 'opacity-50 pointer-events-none bg-slate-50/40 border-slate-200/60'
                        : 'bg-slate-50/80 border-slate-200/80'
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
                          !biometricSupported || loadingBio
                            ? 'cursor-not-allowed opacity-50'
                            : 'cursor-pointer'
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

                  {/* Lock Timeout */}
                  <div
                    className={`space-y-2.5 p-4 bg-slate-50/80 border border-slate-200/80 rounded-2xl ${
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
                    <div className="grid grid-cols-3 gap-2.5 pt-1">
                      {[
                        { label: t('settings.timeoutImmediate'), value: 0 },
                        { label: t('settings.timeout1m'), value: 60 },
                        { label: t('settings.timeout5m'), value: 300 },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setLockTimeout(opt.value)}
                          className={`py-2 px-3 text-xs font-semibold rounded-xl border transition-all cursor-pointer text-center ${
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
            )}

            {/* ── TAB 2: PUSH NOTIFICATIONS ── */}
            {activeTab === 'notifications' && (
              <div className="space-y-5 animate-fade-in">
                <div>
                  <h4 className="text-sm sm:text-base font-bold text-slate-800 tracking-tight">
                    {t('settings.pushTitle')}
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {t('settings.pushSubtitle')}
                  </p>
                </div>

                <div className="p-5 bg-slate-50/80 border border-slate-200/80 rounded-2xl space-y-4">
                  {/* Family & Guests */}
                  <div className="flex items-center justify-between pb-3.5 border-b border-slate-200/60">
                    <div className="pr-3">
                      <label className="text-sm font-bold text-slate-700 block">
                        {t('settings.pushFamily')}
                      </label>
                      <p className="text-xs text-slate-500 mt-0.5 max-w-lg">
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
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
                    </label>
                  </div>

                  {/* Strangers & Security Alerts */}
                  <div className="flex items-center justify-between pb-3.5 border-b border-slate-200/60">
                    <div className="pr-3">
                      <label className="text-sm font-bold text-slate-700 block">
                        {t('settings.pushStranger')}
                      </label>
                      <p className="text-xs text-slate-500 mt-0.5 max-w-lg">
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
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
                    </label>
                  </div>

                  {/* System */}
                  <div className="flex items-center justify-between">
                    <div className="pr-3">
                      <label className="text-sm font-bold text-slate-700 block">
                        {t('settings.pushSystem')}
                      </label>
                      <p className="text-xs text-slate-500 mt-0.5 max-w-lg">
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
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
                    </label>
                  </div>
                </div>

                {/* PWA Mode Info Badge */}
                <div
                  className={`p-4 rounded-2xl border flex items-center gap-3 text-xs ${
                    isRunningPwa
                      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-800'
                      : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  <Smartphone
                    size={20}
                    className={isRunningPwa ? 'text-emerald-600 shrink-0' : 'text-slate-400 shrink-0'}
                  />
                  <div>
                    <span className="font-bold text-sm block">
                      {isRunningPwa ? t('settings.pwaActive') : t('settings.browserMode')}
                    </span>
                    <p className="text-xs opacity-80 mt-0.5">
                      {isRunningPwa ? t('settings.pwaDesc') : t('settings.browserDesc')}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB 3: GENERAL PREFERENCES ── */}
            {activeTab === 'general' && (
              <div className="space-y-5 animate-fade-in">
                <div>
                  <h4 className="text-sm sm:text-base font-bold text-slate-800 tracking-tight">
                    {t('settings.tabGeneral')}
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {t('settings.timezoneDesc')}
                  </p>
                </div>

                {/* Setting: Timezone Preference */}
                <div className="p-5 bg-slate-50/80 border border-slate-200/80 rounded-2xl space-y-3">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                    <Globe size={18} className="text-orange-600 shrink-0" />
                    <span>{t('settings.timezoneTitle')}</span>
                  </div>
                  <p className="text-xs text-slate-500 max-w-xl">
                    {t('settings.timezoneDesc')}
                  </p>
                  <div className="pt-2 max-w-md">
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-slate-800 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 cursor-pointer shadow-2xs"
                    >
                      {TIMEZONE_OPTIONS.map((tz) => (
                        <option key={tz.value} value={tz.value}>
                          {tz.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* PWA Mode Info Badge */}
                <div
                  className={`p-4 rounded-2xl border flex items-center gap-3 text-xs ${
                    isRunningPwa
                      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-800'
                      : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  <Smartphone
                    size={20}
                    className={isRunningPwa ? 'text-emerald-600 shrink-0' : 'text-slate-400 shrink-0'}
                  />
                  <div>
                    <span className="font-bold text-sm block">
                      {isRunningPwa ? t('settings.pwaActive') : t('settings.browserMode')}
                    </span>
                    <p className="text-xs opacity-80 mt-0.5">
                      {isRunningPwa ? t('settings.pwaDesc') : t('settings.browserDesc')}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
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
