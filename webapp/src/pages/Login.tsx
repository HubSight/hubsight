import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../i18n';
import type { Locale } from '../i18n';
import {
  Camera,
  Lock,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  Globe,
  ShieldCheck,
  ArrowLeft,
  Loader2,
  Fingerprint,
} from 'lucide-react';
import { api } from '../api/client';
import { isApiError, getErrorMessage, isPasskeySupported } from '@hubsight/sdk';
import { AppFooter } from '../components/AppFooter';

const Login = () => {
  // Step: 'credentials' or '2fa'
  const [step, setStep] = useState<'credentials' | '2fa'>('credentials');

  // Credentials state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // 2FA state
  const [preAuthToken, setPreAuthToken] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');

  // Passkey support state
  const [passkeySupported, setPasskeySupported] = useState<boolean>(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { checkAuth } = useAuth();
  const { t, locale, setLocale } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;
    isPasskeySupported().then((supported) => {
      if (isMounted) setPasskeySupported(supported);
    });

    // WebAuthn Level 3 Conditional Mediation (autofill when input is focused)
    if (
      typeof window !== 'undefined' &&
      window.PublicKeyCredential &&
      PublicKeyCredential.isConditionalMediationAvailable
    ) {
      PublicKeyCredential.isConditionalMediationAvailable().then((available) => {
        if (available && isMounted) {
          api.auth
            .loginWithPasskey(undefined, true)
            .then(async (res) => {
              if (isMounted && res) {
                await checkAuth();
                navigate('/devices');
              }
            })
            .catch(() => {
              // Conditional mediation quietly ignored
            });
        }
      }).catch(() => {});
    }

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSwitchLocale = () => {
    const newLocale: Locale = locale === 'vi' ? 'en' : 'vi';
    setLocale(newLocale);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await api.auth.login({ username, password });
      if (res.status === '2fa_required') {
        setPreAuthToken(res.pre_auth_token || '');
        setStep('2fa');
        return;
      }
      await checkAuth();
      navigate('/devices');
    } catch (err) {
      if (isApiError(err)) {
        setError(getErrorMessage(err, t('login.authFailed')));
      } else {
        setError(t('login.networkError'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.auth.verify2FA({
        pre_auth_token: preAuthToken,
        code: useRecoveryCode ? undefined : twoFactorCode.trim(),
        recovery_code: useRecoveryCode ? recoveryCode.trim() : undefined,
      });
      await checkAuth();
      navigate('/devices');
    } catch (err) {
      if (isApiError(err)) {
        setError(getErrorMessage(err, t('login.invalid2faCode')));
      } else {
        setError(t('login.invalid2faCode'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    setError('');
    setPasskeyLoading(true);

    try {
      await api.auth.loginWithPasskey(username.trim() || undefined);
      await checkAuth();
      navigate('/devices');
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.message?.includes('cancel')) {
        return;
      }
      if (isApiError(err)) {
        setError(getErrorMessage(err, t('login.passkeyFailed')));
      } else {
        setError(err?.message || t('login.passkeyFailed'));
      }
    } finally {
      setPasskeyLoading(false);
    }
  };

  const handleBackToCredentials = () => {
    setStep('credentials');
    setPreAuthToken('');
    setTwoFactorCode('');
    setRecoveryCode('');
    setError('');
  };

  return (
    <div className="relative min-h-[100dvh] w-full flex flex-col sm:justify-center sm:items-center bg-slate-900 p-0 sm:p-6 font-sans text-slate-800 overflow-x-hidden overflow-y-auto overscroll-none select-none">
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none" aria-hidden>
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat scale-[1.03]"
          style={{
            backgroundImage: 'url(/bg-auth.svg)',
            filter: 'brightness(0.62) saturate(0.82) contrast(1.08)',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950/35 via-slate-900/15 to-orange-950/25" />
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 58% 42%, transparent 28%, rgba(15, 23, 42, 0.38) 72%, rgba(15, 23, 42, 0.62) 100%)',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/55 via-transparent to-slate-900/20" />
      </div>

      <div className="absolute top-overlay-safe right-overlay-safe z-20">
        <button
          onClick={handleSwitchLocale}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/90 backdrop-blur-md border border-slate-200 shadow-sm rounded-xl text-xs font-semibold text-slate-700 hover:bg-white transition-all cursor-pointer"
        >
          <Globe size={14} className="text-slate-400" />
          <span>{locale === 'vi' ? '🇻🇳 Tiếng Việt' : '🇬🇧 English'}</span>
        </button>
      </div>

      <div className="relative z-10 w-full sm:max-w-[420px] flex-1 sm:flex-none flex flex-col min-h-0 pt-[calc(env(safe-area-inset-top,0px)+3.25rem)] sm:pt-0 sm:my-auto">
        <div className="flex-1 sm:flex-none flex flex-col bg-white/95 backdrop-blur-xl border-t border-slate-200/70 sm:border sm:border-slate-200/80 rounded-t-[1.75rem] sm:rounded-3xl px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-8 md:p-9 shadow-[0_-12px_40px_rgba(15,23,42,0.14)] sm:shadow-[0_0_0_0.5px_rgba(15,23,42,0.04),0_1px_1px_rgba(15,23,42,0.04),0_8px_28px_rgba(15,23,42,0.08)]">
          <div className="sm:hidden flex justify-center pb-3 pt-0.5" aria-hidden>
            <span className="block w-10 h-1 rounded-full bg-slate-300/90" />
          </div>

          {/* Header */}
          <div className="flex flex-col items-center text-center mb-5 sm:mb-7">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-orange-600 flex items-center justify-center text-white mb-3 sm:mb-3.5 shadow-sm">
              {step === '2fa' ? (
                <ShieldCheck className="w-6 h-6 sm:w-7 sm:h-7" />
              ) : (
                <Camera className="w-6 h-6 sm:w-7 sm:h-7" />
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">
              {step === '2fa' ? t('login.twoFactorTitle') : t('login.title')}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              {step === '2fa' ? t('login.twoFactorSubtitle') : t('login.subtitle')}
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs sm:text-sm font-medium flex items-start gap-2 animate-fade-in">
              <span className="text-red-500 mt-0.5">•</span>
              <span className="flex-1">{error}</span>
            </div>
          )}

          {/* ── STEP 1: Username & Password / Passkey ── */}
          {step === 'credentials' ? (
            <div className="space-y-4 sm:space-y-5 flex-1">
              {/* Passkey Button (if supported) */}
              {passkeySupported && (
                <div>
                  <button
                    type="button"
                    onClick={handlePasskeyLogin}
                    disabled={passkeyLoading || loading}
                    className="w-full min-h-[46px] sm:min-h-[44px] py-2.5 px-4 bg-slate-900 hover:bg-slate-800 active:bg-black text-white font-semibold rounded-xl transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shadow-2xs touch-manipulation"
                  >
                    {passkeyLoading ? (
                      <Loader2 size={18} className="animate-spin text-orange-500" />
                    ) : (
                      <Fingerprint size={18} className="text-orange-400" />
                    )}
                    <span>{t('login.passkeyBtn')}</span>
                  </button>

                  <div className="relative my-4 flex items-center justify-center">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-200" />
                    </div>
                    <div className="relative bg-white px-3 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                      {t('login.or')}
                    </div>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">
                    {t('login.username')}
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <User size={18} />
                    </span>
                    <input
                      type="text"
                      required
                      autoFocus
                      autoComplete="username webauthn"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder={t('login.usernamePlaceholder')}
                      className="w-full pl-11 pr-4 py-3 sm:py-2.5 bg-slate-50/80 border border-slate-200 rounded-xl text-base sm:text-sm text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all touch-manipulation"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">
                    {t('login.password')}
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Lock size={18} />
                    </span>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t('login.passwordPlaceholder')}
                      className="w-full pl-11 pr-12 py-3 sm:py-2.5 bg-slate-50/80 border border-slate-200 rounded-xl text-base sm:text-sm text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all touch-manipulation"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute inset-y-0 right-0 w-11 flex items-center justify-center text-slate-400 hover:text-slate-600 active:text-slate-800 transition-colors cursor-pointer touch-manipulation"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full min-h-[46px] sm:min-h-[44px] mt-6 py-3 sm:py-2.5 px-4 bg-orange-600 hover:bg-orange-700 active:bg-orange-800 active:scale-[0.99] text-white font-semibold rounded-xl transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed touch-manipulation"
                >
                  {loading ? (
                    <span>{t('login.signingIn')}</span>
                  ) : (
                    <>
                      <span>{t('login.submit')}</span>
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </form>
            </div>
          ) : (
            /* ── STEP 2: 2FA TOTP or Backup Recovery Code ── */
            <form onSubmit={handleVerify2FA} className="space-y-4 sm:space-y-5 flex-1 animate-fade-in">
              {!useRecoveryCode ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">
                    {t('login.twoFactorCode')}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      required
                      autoFocus
                      value={twoFactorCode}
                      onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, ''))}
                      placeholder={t('login.twoFactorCodePlaceholder')}
                      className="w-full text-center tracking-[0.4em] font-mono text-xl font-bold py-3 bg-slate-50/80 border border-slate-200 rounded-xl text-slate-800 focus:bg-white focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all touch-manipulation"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">
                    {t('login.recoveryCode')}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      autoFocus
                      value={recoveryCode}
                      onChange={(e) => setRecoveryCode(e.target.value)}
                      placeholder={t('login.recoveryCodePlaceholder')}
                      className="w-full text-center font-mono text-base font-bold py-3 bg-slate-50/80 border border-slate-200 rounded-xl text-slate-800 uppercase focus:bg-white focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all touch-manipulation"
                    />
                  </div>
                </div>
              )}

              {/* Toggle TOTP / Recovery Code */}
              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setUseRecoveryCode(!useRecoveryCode);
                    setError('');
                  }}
                  className="text-xs text-orange-600 hover:text-orange-700 font-semibold hover:underline cursor-pointer"
                >
                  {useRecoveryCode ? t('login.useTotpCode') : t('login.useRecoveryCode')}
                </button>
              </div>

              <div className="space-y-2 pt-2">
                <button
                  type="submit"
                  disabled={loading || (!useRecoveryCode && twoFactorCode.length !== 6) || (useRecoveryCode && !recoveryCode.trim())}
                  className="w-full min-h-[46px] sm:min-h-[44px] py-3 sm:py-2.5 px-4 bg-orange-600 hover:bg-orange-700 active:bg-orange-800 active:scale-[0.99] text-white font-semibold rounded-xl transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed touch-manipulation"
                >
                  {loading ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <span>{t('login.verifyBtn')}</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleBackToCredentials}
                  className="w-full py-2.5 px-4 text-slate-500 hover:text-slate-800 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <ArrowLeft size={14} />
                  <span>{t('login.backToLogin')}</span>
                </button>
              </div>
            </form>
          )}

          <div className="pt-4 mt-auto sm:mt-6 border-t border-slate-100">
            <AppFooter className="pb-0 pt-2" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
