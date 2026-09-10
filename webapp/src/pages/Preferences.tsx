import React, { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useTimezone, TIMEZONE_OPTIONS } from '../context/TimezoneContext';
import { useTranslation } from '../i18n';
import { api } from '../api/client';
import { isApiError, getErrorMessage } from '@hubsight/sdk';
import { isPwa } from '../utils/pwa';
import {
  User as UserIcon,
  ShieldCheck,
  Sliders,
  Bell,
  KeyRound,
  Eye,
  EyeOff,
  Check,
  Copy,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RotateCw,
  Sun,
  Moon,
  Monitor,
  Globe,
  Smartphone,
  ChevronRight,
} from '@/components/icons';
import { TwoFactorSetupModal } from '../components/settings/TwoFactorSetupModal';
import { PasskeySettingsSection } from '../components/settings/PasskeySettingsSection';
import dayjs from 'dayjs';

type PreferencesTab = 'profile' | 'security' | 'preferences' | 'notifications';

export const Preferences: React.FC = () => {
  const { t, locale, setLocale } = useTranslation();
  const { user, setUser } = useAuth();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { timezone, setTimezone } = useTimezone();
  const [searchParams, setSearchParams] = useSearchParams();

  // Active Tab from query param with fallback to 'profile'
  const tabParam = searchParams.get('tab');
  const activeTab: PreferencesTab =
    tabParam === 'security' || tabParam === 'preferences' || tabParam === 'notifications'
      ? tabParam
      : 'profile';

  const setActiveTab = (tab: PreferencesTab) => {
    setSearchParams({ tab });
  };

  // ── Change Password State ──────────────────────────────────────────────────
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOldPass, setShowOldPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // ── Two Factor Modal State ─────────────────────────────────────────────────
  const [twoFactorModalMode, setTwoFactorModalMode] = useState<
    'setup' | 'regenerate' | 'disable' | null
  >(null);

  // ── Copy Feedback State ───────────────────────────────────────────────────
  const [copiedId, setCopiedId] = useState(false);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleCopyId = (id: string) => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handle2FARefresh = async () => {
    try {
      const updatedUser = await api.auth.me();
      setUser(updatedUser);
    } catch {
      /* ignore */
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (!oldPassword.trim()) {
      setPasswordError(t('password.errEmpty'));
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError(t('password.errShort'));
      return;
    }

    if (newPassword === oldPassword) {
      setPasswordError(t('password.errSame'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError(t('password.errMismatch'));
      return;
    }

    setIsChangingPassword(true);

    try {
      await api.auth.changePassword({
        old_password: oldPassword,
        new_password: newPassword,
      });
      setPasswordSuccess(t('password.success'));
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(''), 5000);
    } catch (err) {
      if (isApiError(err)) {
        setPasswordError(getErrorMessage(err, t('password.errDefault')));
      } else {
        setPasswordError(t('password.errNetwork'));
      }
    } finally {
      setIsChangingPassword(false);
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

  const handleSelectTheme = async (newTheme: 'system' | 'light' | 'dark') => {
    setTheme(newTheme);
    try {
      await api.auth.setTheme(newTheme);
    } catch {
      /* ignore */
    }
  };

  const handleSelectTimezone = async (newTz: string) => {
    setTimezone(newTz);
    try {
      await api.auth.setTimezone(newTz);
    } catch {
      /* ignore */
    }
  };

  const handleSelectLocale = async (newLocale: 'vi' | 'en') => {
    setLocale(newLocale);
    try {
      await api.auth.setLocale(newLocale);
    } catch {
      /* ignore */
    }
  };

  const isRunningPwa = isPwa();

  const tabs = [
    {
      id: 'profile' as const,
      label: t('settings.tabProfile'),
      icon: UserIcon,
    },
    {
      id: 'security' as const,
      label: t('settings.tabSecurity'),
      icon: ShieldCheck,
    },
    {
      id: 'preferences' as const,
      label: t('settings.tabPreferences'),
      icon: Sliders,
    },
    {
      id: 'notifications' as const,
      label: t('settings.tabNotifications'),
      icon: Bell,
    },
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* ── TOP HEADER ── */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 px-4 sm:px-8 pt-4 sm:pt-6 pb-4 shrink-0">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-orange-50 dark:bg-orange-950/50 border border-orange-200/80 dark:border-orange-500/30 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0 shadow-2xs">
              <Sliders size={22} />
            </div>
            <div>
              {/* Breadcrumb path */}
              <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 font-medium mb-0.5">
                <Link to="/" className="hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                  {t('settings.breadcrumbRoot')}
                </Link>
                <ChevronRight size={12} />
                <span className="text-slate-700 dark:text-slate-300 font-semibold">
                  {t('nav.preferences')}
                </span>
              </div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-tight">
                {t('preferences.pageTitle')}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 hidden sm:block">
                {t('preferences.pageSubtitle')}
              </p>
            </div>
          </div>

          {/* User Quick Info Pill */}
          {user && (
            <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 px-3.5 py-2 rounded-2xl self-start sm:self-auto shadow-2xs">
              <div className="w-8 h-8 rounded-full bg-orange-600 text-white font-bold text-xs flex items-center justify-center uppercase shrink-0 shadow-2xs">
                {user.full_name ? user.full_name.charAt(0) : user.username.charAt(0)}
              </div>
              <div className="min-w-0 pr-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate max-w-[150px]">
                    {user.full_name || user.username}
                  </span>
                  <span
                    className={`inline-block w-2 h-2 rounded-full ring-2 ring-white dark:ring-slate-900 shrink-0 ${
                      user.is_active ? 'bg-emerald-500' : 'bg-red-500'
                    }`}
                    title={user.is_active ? t('settings.onlineStatus') : t('settings.accountStatusInactive')}
                  />
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] text-slate-400 dark:text-slate-400 font-mono">
                    @{user.username}
                  </span>
                  <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded border bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800/50">
                    {user.role === 'admin' ? t('admin') : t('viewer')}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── HORIZONTAL NAVIGATION TABS BAR (TOP LEVEL) ── */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 px-4 sm:px-8 shadow-2xs shrink-0">
        <div className="max-w-5xl mx-auto flex items-center gap-2 sm:gap-4 overflow-x-auto scrollbar-none py-1.5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 border border-orange-200/90 dark:border-orange-500/30 shadow-2xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/60 dark:hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                    isActive
                      ? 'bg-orange-600 text-white shadow-2xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <Icon size={15} />
                </div>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── MAIN CONTENT AREA (FULL-WIDTH BALANCED CONTAINER) ── */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 custom-scrollbar">
        <div className="max-w-5xl mx-auto pb-16">
          {/* ══════════════════════════════════════════════════════════════════
              TAB 1: PROFILE & ACCOUNT
             ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'profile' && (
            <div className="space-y-6 animate-fade-in">
              {/* User Identity Card */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl sm:rounded-3xl p-5 sm:p-7 shadow-2xs space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-orange-600 text-white font-bold text-2xl flex items-center justify-center uppercase shadow-md shrink-0">
                      {user?.full_name ? user.full_name.charAt(0) : user?.username.charAt(0)}
                    </div>
                    <div>
                      <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">
                        {user?.full_name || user?.username}
                      </h2>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">
                          @{user?.username}
                        </span>
                        <span className="text-slate-300 dark:text-slate-700">•</span>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          {user?.is_active ? t('settings.accountStatusActive') : t('settings.accountStatusInactive')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded text-xs font-bold uppercase tracking-wider bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800/50">
                      {user?.role === 'admin' ? t('admin') : t('viewer')}
                    </span>
                  </div>
                </div>

                {/* Profile Metadata Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* User ID */}
                  <div className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800/60">
                    <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 block mb-1">
                      {t('settings.userId')}
                    </span>
                    <div className="flex items-center justify-between gap-2">
                      <code className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200 truncate">
                        {user?.id || '—'}
                      </code>
                      {user?.id && (
                        <button
                          type="button"
                          onClick={() => handleCopyId(user.id)}
                          className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
                          title={t('settings.copyId')}
                        >
                          {copiedId ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Role & Access */}
                  <div className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800/60">
                    <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 block mb-1">
                      {t('settings.role')}
                    </span>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {user?.role === 'admin'
                        ? 'Administrator (Full System Access)'
                        : user?.role_info?.name || 'Viewer / Operator'}
                    </span>
                  </div>

                  {/* Account Created Date */}
                  <div className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800/60">
                    <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 block mb-1">
                      {t('settings.createdAt')}
                    </span>
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {user?.created_at ? dayjs(user.created_at).format('DD/MM/YYYY HH:mm') : '—'}
                    </span>
                  </div>

                  {/* Last Login Date */}
                  <div className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800/60">
                    <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 block mb-1">
                      {t('settings.lastLogin')}
                    </span>
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {user?.last_login_at ? dayjs(user.last_login_at).format('DD/MM/YYYY HH:mm') : t('settings.neverLoggedIn')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Change Password Card (In-place Form) */}
              <div id="password" className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl sm:rounded-3xl p-5 sm:p-7 shadow-2xs space-y-5">
                <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                  <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-950/50 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0 shadow-2xs">
                    <KeyRound size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      {t('settings.changePasswordCardTitle')}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {t('settings.changePasswordCardSubtitle')}
                    </p>
                  </div>
                </div>

                {passwordError && (
                  <div className="flex items-start gap-2.5 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-300 p-3.5 rounded-2xl text-xs sm:text-sm font-medium">
                    <AlertCircle size={17} className="shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
                    <span>{passwordError}</span>
                  </div>
                )}

                {passwordSuccess && (
                  <div className="flex items-center gap-2.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-300 p-3.5 rounded-2xl text-xs sm:text-sm font-medium">
                    <CheckCircle2 size={17} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>{passwordSuccess}</span>
                  </div>
                )}

                <form onSubmit={handleChangePassword} className="space-y-4 max-w-xl">
                  {/* Old Password */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      {t('password.currentPassword')}
                    </label>
                    <div className="relative">
                      <input
                        type={showOldPass ? 'text' : 'password'}
                        required
                        value={oldPassword}
                        onChange={(e) => setOldPassword(e.target.value)}
                        placeholder={t('password.currentPasswordPlaceholder')}
                        className="input-field w-full pr-10 text-xs sm:text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowOldPass(!showOldPass)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
                        tabIndex={-1}
                      >
                        {showOldPass ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* New Password */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                        {t('password.newPassword')}
                      </label>
                      <div className="relative">
                        <input
                          type={showNewPass ? 'text' : 'password'}
                          required
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder={t('password.newPasswordPlaceholder')}
                          className="input-field w-full pr-10 text-xs sm:text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPass(!showNewPass)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
                          tabIndex={-1}
                        >
                          {showNewPass ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    {/* Confirm New Password */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                        {t('password.confirmPassword')}
                      </label>
                      <div className="relative">
                        <input
                          type={showConfirmPass ? 'text' : 'password'}
                          required
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder={t('password.confirmPasswordPlaceholder')}
                          className={`input-field w-full pr-10 text-xs sm:text-sm ${
                            confirmPassword && newPassword !== confirmPassword
                              ? 'border-red-300 dark:border-red-500/50 focus:border-red-500 focus:ring-red-200'
                              : ''
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPass(!showConfirmPass)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
                          tabIndex={-1}
                        >
                          {showConfirmPass ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    {t('settings.passwordRequirements')}
                  </p>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isChangingPassword}
                      className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs hover:shadow-sm transition-all cursor-pointer inline-flex items-center gap-2"
                    >
                      {isChangingPassword && <Loader2 size={16} className="animate-spin" />}
                      <span>{t('settings.updatePasswordBtn')}</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 2: SECURITY & AUTHENTICATION
             ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'security' && (
            <div className="space-y-6 animate-fade-in">
              {/* Two-Factor Authentication Card */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl sm:rounded-3xl p-5 sm:p-7 shadow-2xs space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div className="w-11 h-11 rounded-2xl bg-orange-50 dark:bg-orange-950/40 border border-orange-200/80 dark:border-orange-500/30 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0 shadow-2xs">
                      <ShieldCheck size={22} />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                        {t('settings.twoFactorTitle')}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xl leading-relaxed">
                        {t('settings.twoFactorDesc')}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`px-3 py-1 rounded text-xs font-bold shrink-0 self-start sm:self-auto ${
                      user?.two_factor_enabled
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700/50'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {user?.two_factor_enabled
                      ? t('settings.twoFactorEnabled')
                      : t('settings.twoFactorDisabled')}
                  </span>
                </div>

                <div className="pt-2 flex flex-wrap gap-3">
                  {!user?.two_factor_enabled ? (
                    <button
                      type="button"
                      onClick={() => setTwoFactorModalMode('setup')}
                      className="px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-2xs transition-all cursor-pointer"
                    >
                      {t('settings.enable2faBtn')}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setTwoFactorModalMode('regenerate')}
                        className="px-4 py-2.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 shadow-2xs transition-all cursor-pointer"
                      >
                        <RotateCw size={14} />
                        <span>{t('settings.regenRecoveryBtn')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setTwoFactorModalMode('disable')}
                        className="px-4 py-2.5 bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer"
                      >
                        {t('settings.disable2faBtn')}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Biometric Passkeys (FIDO2 / WebAuthn) Section */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl sm:rounded-3xl p-5 sm:p-7 shadow-2xs">
                <PasskeySettingsSection />
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 3: PREFERENCES & DISPLAY
             ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'preferences' && (
            <div className="space-y-6 animate-fade-in">
              {/* Theme Preference Card */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl sm:rounded-3xl p-5 sm:p-7 shadow-2xs space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-950/50 border border-orange-200/80 dark:border-orange-500/30 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0 shadow-2xs">
                    <Sun size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      {t('settings.themeTitle')}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {t('settings.themeDesc')}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  {/* System Option */}
                  <button
                    type="button"
                    onClick={() => handleSelectTheme('system')}
                    className={`flex flex-col items-start p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                      theme === 'system'
                        ? 'bg-orange-50/70 dark:bg-orange-950/30 border-orange-500 ring-2 ring-orange-500/20 shadow-xs'
                        : 'bg-slate-50/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-3">
                      <div
                        className={`p-2.5 rounded-xl ${
                          theme === 'system'
                            ? 'bg-orange-600 text-white shadow-2xs'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <Monitor size={18} />
                      </div>
                      {theme === 'system' && (
                        <span className="text-[10px] font-bold text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-950/60 px-2 py-0.5 rounded">
                          Active
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-100 block">
                      {t('settings.themeSystem')}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 block leading-tight">
                      {t('settings.themeSystemDesc')}{' '}
                      {theme === 'system' &&
                        `(${
                          resolvedTheme === 'dark'
                            ? t('settings.themeCurrentlyDark')
                            : t('settings.themeCurrentlyLight')
                        })`}
                    </span>
                  </button>

                  {/* Light Option */}
                  <button
                    type="button"
                    onClick={() => handleSelectTheme('light')}
                    className={`flex flex-col items-start p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                      theme === 'light'
                        ? 'bg-orange-50/70 dark:bg-orange-950/30 border-orange-500 ring-2 ring-orange-500/20 shadow-xs'
                        : 'bg-slate-50/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-3">
                      <div
                        className={`p-2.5 rounded-xl ${
                          theme === 'light'
                            ? 'bg-orange-600 text-white shadow-2xs'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <Sun size={18} />
                      </div>
                      {theme === 'light' && (
                        <span className="text-[10px] font-bold text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-950/60 px-2 py-0.5 rounded">
                          Active
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-100 block">
                      {t('settings.themeLight')}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 block leading-tight">
                      {t('settings.themeLightDesc')}
                    </span>
                  </button>

                  {/* Dark Option */}
                  <button
                    type="button"
                    onClick={() => handleSelectTheme('dark')}
                    className={`flex flex-col items-start p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                      theme === 'dark'
                        ? 'bg-orange-50/70 dark:bg-orange-950/30 border-orange-500 ring-2 ring-orange-500/20 shadow-xs'
                        : 'bg-slate-50/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-3">
                      <div
                        className={`p-2.5 rounded-xl ${
                          theme === 'dark'
                            ? 'bg-orange-600 text-white shadow-2xs'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <Moon size={18} />
                      </div>
                      {theme === 'dark' && (
                        <span className="text-[10px] font-bold text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-950/60 px-2 py-0.5 rounded">
                          Active
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-100 block">
                      {t('settings.themeDark')}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 block leading-tight">
                      {t('settings.themeDarkDesc')}
                    </span>
                  </button>
                </div>
              </div>

              {/* Display Timezone Card */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl sm:rounded-3xl p-5 sm:p-7 shadow-2xs space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-950/50 border border-orange-200/80 dark:border-orange-500/30 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0 shadow-2xs">
                    <Globe size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      {t('settings.timezoneTitle')}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {t('settings.timezoneDesc')}
                    </p>
                  </div>
                </div>

                <div className="pt-2 max-w-md">
                  <select
                    value={timezone}
                    onChange={(e) => handleSelectTimezone(e.target.value)}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 focus:outline-hidden focus:border-orange-500 focus:ring-1 focus:ring-orange-500 cursor-pointer shadow-2xs"
                  >
                    {TIMEZONE_OPTIONS.map((tz) => (
                      <option key={tz.value} value={tz.value}>
                        {tz.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Language Preference Card */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl sm:rounded-3xl p-5 sm:p-7 shadow-2xs space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-950/50 border border-orange-200/80 dark:border-orange-500/30 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0 shadow-2xs">
                    <Globe size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      {t('settings.languageTitle')}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {t('settings.languageDesc')}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 max-w-md">
                  <button
                    type="button"
                    onClick={() => handleSelectLocale('vi')}
                    className={`flex items-center justify-between p-3.5 rounded-2xl border font-bold text-xs sm:text-sm transition-all cursor-pointer ${
                      locale === 'vi'
                        ? 'bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 border-orange-500 ring-2 ring-orange-500/20'
                        : 'bg-slate-50/60 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-base">🇻🇳</span>
                      <span>{t('settings.langVi')}</span>
                    </div>
                    {locale === 'vi' && <Check size={16} className="text-orange-600" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectLocale('en')}
                    className={`flex items-center justify-between p-3.5 rounded-2xl border font-bold text-xs sm:text-sm transition-all cursor-pointer ${
                      locale === 'en'
                        ? 'bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 border-orange-500 ring-2 ring-orange-500/20'
                        : 'bg-slate-50/60 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-base">🇺🇸</span>
                      <span>{t('settings.langEn')}</span>
                    </div>
                    {locale === 'en' && <Check size={16} className="text-orange-600" />}
                  </button>
                </div>
              </div>

              {/* App Runtime Mode (PWA vs Browser) */}
              <div
                className={`p-5 rounded-2xl sm:rounded-3xl border flex items-center gap-4 shadow-2xs ${
                  isRunningPwa
                    ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300'
                    : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                    isRunningPwa
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
                  }`}
                >
                  <Smartphone size={24} />
                </div>
                <div>
                  <span className="font-bold text-sm sm:text-base block text-slate-900 dark:text-slate-100">
                    {isRunningPwa ? t('settings.pwaActive') : t('settings.browserMode')}
                  </span>
                  <p className="text-xs opacity-80 mt-0.5 leading-relaxed">
                    {isRunningPwa ? t('settings.pwaDesc') : t('settings.browserDesc')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 4: PUSH NOTIFICATIONS
             ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'notifications' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl sm:rounded-3xl p-5 sm:p-7 shadow-2xs space-y-5">
                <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                  <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-950/50 border border-orange-200/80 dark:border-orange-500/30 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0 shadow-2xs">
                    <Bell size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      {t('settings.pushTitle')}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {t('settings.pushSubtitle')}
                    </p>
                  </div>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {/* Family & Guests */}
                  <div className="py-4 flex items-center justify-between gap-4">
                    <div className="pr-2">
                      <label className="text-sm font-bold text-slate-800 dark:text-slate-200 block">
                        {t('settings.pushFamily')}
                      </label>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-xl">
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
                      <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 dark:after:border-slate-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600" />
                    </label>
                  </div>

                  {/* Strangers & Security Alerts */}
                  <div className="py-4 flex items-center justify-between gap-4">
                    <div className="pr-2">
                      <label className="text-sm font-bold text-slate-800 dark:text-slate-200 block">
                        {t('settings.pushStranger')}
                      </label>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-xl">
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
                      <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 dark:after:border-slate-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600" />
                    </label>
                  </div>

                  {/* System Notifications */}
                  <div className="py-4 flex items-center justify-between gap-4">
                    <div className="pr-2">
                      <label className="text-sm font-bold text-slate-800 dark:text-slate-200 block">
                        {t('settings.pushSystem')}
                      </label>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-xl">
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
                      <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 dark:after:border-slate-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600" />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 2FA SETUP / REGENERATE / DISABLE MODAL ── */}
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

export default Preferences;
