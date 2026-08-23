import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useAppLock } from '../../context/AppLockContext';
import { useTranslation } from '../../i18n';
import { Fingerprint, ScanFace, KeyRound, Lock, Eye, EyeOff, LogOut, Loader2, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import axiosClient from '../../api/axiosClient';
import { clearPwaRefreshToken } from '../../utils/pwa';

type BioType = 'face' | 'fingerprint' | 'key';

const detectBioType = (): BioType => {
  if (typeof window === 'undefined') return 'key';
  const ua = navigator.userAgent || '';

  // iOS Face ID detection (iPhone X and newer has viewport/screen height >= 812)
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) {
    const isIPhoneWithFaceID = /iPhone/i.test(ua) && window.screen.height >= 812;
    if (isIPhoneWithFaceID) return 'face';
    return 'fingerprint';
  }

  // Android device biometrics (primarily fingerprint sensors)
  if (/Android/i.test(ua)) {
    return 'fingerprint';
  }

  // macOS with Touch ID
  if (/Macintosh|Mac OS X/i.test(ua)) {
    return 'fingerprint';
  }

  // Fallback: Windows Hello / Passkey / Generic Authenticator -> Key
  return 'key';
};

export const AppLockScreen: React.FC = () => {
  const { user, checkAuth } = useAuth();
  const { t } = useTranslation();
  const {
    isLocked,
    biometricEnabled,
    unlockWithBiometrics,
    unlockWithPassword,
  } = useAppLock();

  const navigate = useNavigate();
  const [bioType] = useState<BioType>(() => detectBioType());
  const [usePasswordMode, setUsePasswordMode] = useState(!biometricEnabled);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isPromptingBio, setIsPromptingBio] = useState(false);

  const getBioLabel = () => {
    if (bioType === 'face') return t('lock.unlockFaceId');
    if (bioType === 'fingerprint') return t('lock.unlockTouchId');
    return t('lock.unlockKey');
  };

  const renderBioIcon = (size = 18) => {
    if (bioType === 'face') return <ScanFace size={size} />;
    if (bioType === 'fingerprint') return <Fingerprint size={size} />;
    return <KeyRound size={size} />;
  };

  // Trigger biometric prompt on mount if biometrics is enabled
  const triggerBiometricUnlock = async (showErrorOnCancel = false) => {
    setError('');
    setIsPromptingBio(true);
    try {
      const success = await unlockWithBiometrics();
      if (!success && showErrorOnCancel) {
        setError(t('lock.errBioFailed'));
      }
    } catch {
      if (showErrorOnCancel) {
        setError(t('lock.errBioUnavailable'));
      }
    } finally {
      setIsPromptingBio(false);
    }
  };

  useEffect(() => {
    if (isLocked && biometricEnabled && !usePasswordMode) {
      // Small timeout to allow mobile browser to regain active window focus before triggering WebAuthn
      const timer = setTimeout(() => {
        triggerBiometricUnlock(false);
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [isLocked, biometricEnabled]);

  if (!isLocked || !user) return null;

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError(t('lock.errEmptyPass'));
      return;
    }

    setError('');
    setLoading(true);

    try {
      const success = await unlockWithPassword(password);
      if (success) {
        setPassword('');
      } else {
        setError(t('lock.errWrongPass'));
      }
    } catch {
      setError(t('lock.errVerificationFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    clearPwaRefreshToken();
    try {
      await axiosClient.post('/auth/logout');
    } catch {
      // ignore
    }
    await checkAuth();
    navigate('/login');
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-100/95 backdrop-blur-2xl flex flex-col items-center justify-center p-4 sm:p-6 pt-safe pb-safe pl-safe pr-safe text-slate-800 select-none animate-fade-in">
      {/* Main Lock Card */}
      <div className="relative w-full max-w-sm bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-xl flex flex-col items-center text-center">
        {/* User Avatar with Role Badge */}
        <div className="relative mb-4">
          <div
            className={`w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold uppercase shadow-inner ${
              user.role === 'admin'
                ? 'bg-red-50 text-red-600 border-2 border-red-200'
                : 'bg-blue-50 text-blue-600 border-2 border-blue-200'
            }`}
          >
            {user.full_name ? user.full_name.charAt(0) : user.username.charAt(0)}
          </div>
          <div className="absolute -bottom-1 -right-1 bg-slate-900 text-white p-1.5 rounded-full shadow-md border-2 border-white">
            <Lock size={14} className="text-orange-400" />
          </div>
        </div>

        {/* User Name & Details */}
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 truncate max-w-full">
          {user.full_name || user.username}
        </h2>
        <div className="flex items-center gap-1.5 mt-1 mb-6">
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border leading-none ${
              user.role === 'admin'
                ? 'bg-red-50 text-red-600 border-red-200'
                : 'bg-blue-50 text-blue-600 border-blue-200'
            }`}
          >
            {user.role === 'admin' ? t('admin') : t('viewer')}
          </span>
          <span className="text-xs text-slate-400 font-mono truncate">
            @{user.username}
          </span>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="w-full mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs text-left flex items-start gap-2 animate-fade-in">
            <AlertCircle size={15} className="text-red-500 shrink-0 mt-0.5" />
            <span className="flex-1">{error}</span>
          </div>
        )}

        {/* ------------------------------------------- */}
        {/* CASE 1: BIOMETRIC UNLOCK MODE (1 Button)   */}
        {/* ------------------------------------------- */}
        {biometricEnabled && !usePasswordMode ? (
          <div className="w-full flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => triggerBiometricUnlock(true)}
              disabled={isPromptingBio}
              className="btn btn-primary w-full py-3 px-4 text-sm font-semibold rounded-xl flex items-center justify-center gap-2.5 shadow-md active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60"
            >
              {isPromptingBio ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>{t('lock.scanning')}</span>
                </>
              ) : (
                <>
                  {renderBioIcon(19)}
                  <span>{getBioLabel()}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setError('');
                setUsePasswordMode(true);
              }}
              className="text-xs text-slate-500 hover:text-orange-600 font-medium transition-colors cursor-pointer flex items-center gap-1.5 py-1"
            >
              <KeyRound size={13} />
              <span>{t('lock.usePassword')}</span>
            </button>
          </div>
        ) : (
          /* ------------------------------------------- */
          /* CASE 2: TRADITIONAL PASSWORD UNLOCK MODE    */
          /* ------------------------------------------- */
          <form onSubmit={handlePasswordSubmit} className="w-full space-y-4">
            <div className="relative text-left">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {t('lock.enterPasswordToUnlock')}
              </label>
              <div className="relative flex items-center">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('lock.accountPasswordPlaceholder')}
                  autoFocus
                  className="input-field w-full pr-10 text-sm"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full py-2.5 text-sm font-semibold rounded-xl flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>{t('lock.verifying')}</span>
                </>
              ) : (
                <span>{t('lock.unlockApp')}</span>
              )}
            </button>

            {biometricEnabled && (
              <button
                type="button"
                onClick={() => {
                  setError('');
                  setUsePasswordMode(false);
                  triggerBiometricUnlock(true);
                }}
                className="w-full text-xs text-orange-600 hover:text-orange-700 font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5 pt-1"
              >
                {renderBioIcon(14)}
                <span>{t('lock.switchToBio')}</span>
              </button>
            )}
          </form>
        )}

        {/* Bottom Switch Account / Logout */}
        <div className="mt-6 pt-4 border-t border-slate-100 w-full flex justify-center">
          <button
            onClick={handleLogout}
            className="text-xs text-slate-400 hover:text-red-600 transition-colors flex items-center gap-1.5 cursor-pointer font-medium"
          >
            <LogOut size={13} />
            <span>{t('lock.signOut')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
