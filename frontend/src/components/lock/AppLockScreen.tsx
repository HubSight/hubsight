import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useAppLock } from '../../context/AppLockContext';
import { Fingerprint, Lock, KeyRound, Eye, EyeOff, LogOut, Loader2, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import axiosClient from '../../api/axiosClient';
import { clearPwaRefreshToken } from '../../utils/pwa';

export const AppLockScreen: React.FC = () => {
  const { user, checkAuth } = useAuth();
  const {
    isLocked,
    biometricEnabled,
    unlockWithBiometrics,
    unlockWithPassword,
  } = useAppLock();

  const navigate = useNavigate();
  const [usePasswordMode, setUsePasswordMode] = useState(!biometricEnabled);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isPromptingBio, setIsPromptingBio] = useState(false);

  // Trigger biometric prompt on mount if biometrics is enabled
  const triggerBiometricUnlock = async () => {
    setError('');
    setIsPromptingBio(true);
    try {
      const success = await unlockWithBiometrics();
      if (!success) {
        setError('Biometric authentication failed or was cancelled. Please try again or use your password.');
      }
    } catch {
      setError('Unable to authenticate with biometrics. Please use your password.');
    } finally {
      setIsPromptingBio(false);
    }
  };

  useEffect(() => {
    if (isLocked && biometricEnabled && !usePasswordMode) {
      triggerBiometricUnlock();
    }
  }, [isLocked, biometricEnabled]);

  if (!isLocked || !user) return null;

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Please enter your account password.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const success = await unlockWithPassword(password);
      if (success) {
        setPassword('');
      } else {
        setError('Incorrect password. Please try again.');
      }
    } catch {
      setError('Verification failed. Please check your password.');
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
    <div className="fixed inset-0 z-[9999] bg-slate-900/90 backdrop-blur-2xl flex flex-col items-center justify-center p-4 sm:p-6 text-slate-800 select-none animate-fade-in">
      {/* Background ambient lighting */}
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-96 h-96 bg-orange-600/20 rounded-full blur-3xl pointer-events-none" />

      {/* Main Lock Card */}
      <div className="relative w-full max-w-sm bg-white/95 border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl flex flex-col items-center text-center">
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
            {user.role === 'admin' ? 'Admin' : 'Viewer'}
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
        {/* CASE 1: BIOMETRIC UNLOCK MODE               */}
        {/* ------------------------------------------- */}
        {biometricEnabled && !usePasswordMode ? (
          <div className="w-full flex flex-col items-center gap-4">
            <button
              onClick={triggerBiometricUnlock}
              disabled={isPromptingBio}
              className="w-20 h-20 rounded-2xl bg-orange-50 border border-orange-200/80 hover:bg-orange-100 hover:border-orange-300 text-orange-600 flex items-center justify-center shadow-md transition-all active:scale-95 cursor-pointer disabled:opacity-50"
              title="Click to authenticate with Face ID / Fingerprint / Device PIN"
            >
              {isPromptingBio ? (
                <Loader2 size={36} className="animate-spin text-orange-600" />
              ) : (
                <Fingerprint size={42} className="animate-pulse" />
              )}
            </button>

            <p className="text-xs text-slate-500 font-medium">
              Touch ID / Face ID / Device PIN
            </p>

            <button
              type="button"
              onClick={triggerBiometricUnlock}
              disabled={isPromptingBio}
              className="btn btn-primary w-full py-2.5 text-sm font-semibold rounded-xl"
            >
              {isPromptingBio ? 'Scanning...' : 'Unlock with Biometrics'}
            </button>

            <button
              type="button"
              onClick={() => {
                setError('');
                setUsePasswordMode(true);
              }}
              className="text-xs text-slate-500 hover:text-orange-600 font-medium transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <KeyRound size={13} />
              <span>Use Account Password instead</span>
            </button>
          </div>
        ) : (
          /* ------------------------------------------- */
          /* CASE 2: TRADITIONAL PASSWORD UNLOCK MODE    */
          /* ------------------------------------------- */
          <form onSubmit={handlePasswordSubmit} className="w-full space-y-4">
            <div className="relative text-left">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Enter Password to Unlock
              </label>
              <div className="relative flex items-center">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Account password"
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
              className="btn btn-primary w-full py-2.5 text-sm font-semibold rounded-xl flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <span>Unlock Application</span>
              )}
            </button>

            {biometricEnabled && (
              <button
                type="button"
                onClick={() => {
                  setError('');
                  setUsePasswordMode(false);
                  triggerBiometricUnlock();
                }}
                className="w-full text-xs text-orange-600 hover:text-orange-700 font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Fingerprint size={14} />
                <span>Switch to Biometric Unlock</span>
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
            <span>Switch Account / Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
