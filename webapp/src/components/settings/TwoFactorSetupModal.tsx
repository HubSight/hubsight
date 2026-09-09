import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  X,
  Copy,
  Check,
  Download,
  Loader2,
  KeyRound,
  AlertCircle,
} from '@/components/icons';
import { api } from '../../api/client';
import { isApiError, getErrorMessage } from '@hubsight/sdk';
import { useTranslation } from '../../i18n';
import type { TwoFactorSetupResponse } from '@hubsight/sdk';

interface TwoFactorSetupModalProps {
  mode: 'setup' | 'regenerate' | 'disable';
  onClose: () => void;
  onSuccess: () => void;
}

export const TwoFactorSetupModal: React.FC<TwoFactorSetupModalProps> = ({
  mode,
  onClose,
  onSuccess,
}) => {
  const { t } = useTranslation();

  // Setup state
  const [setupData, setSetupData] = useState<TwoFactorSetupResponse | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Recovery codes display state
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [copiedCodes, setCopiedCodes] = useState(false);
  const [hasSavedCodes, setHasSavedCodes] = useState(false);

  // Password confirmation for disable / regenerate
  const [password, setPassword] = useState('');

  // Status state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'initial' | 'codes'>('initial');

  useEffect(() => {
    if (mode === 'setup') {
      loadSetupData();
    }
  }, [mode]);

  const loadSetupData = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.auth.setup2FA();
      setSetupData(data);
    } catch (err) {
      if (isApiError(err)) {
        setError(getErrorMessage(err, t('settings.twoFactorInitError')));
      } else {
        setError(t('settings.twoFactorInitRetry'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCopySecret = () => {
    if (!setupData?.secret) return;
    navigator.clipboard.writeText(setupData.secret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  const handleEnable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verificationCode.trim()) return;

    setLoading(true);
    setError('');
    try {
      await api.auth.enable2FA(verificationCode.trim());
      if (setupData?.recovery_codes) {
        setRecoveryCodes(setupData.recovery_codes);
        setStep('codes');
      } else {
        onSuccess();
        onClose();
      }
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

  const handleRegenerateCodes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setLoading(true);
    setError('');
    try {
      const codes = await api.auth.regenerateRecoveryCodes(password);
      setRecoveryCodes(codes);
      setStep('codes');
    } catch (err) {
      if (isApiError(err)) {
        setError(getErrorMessage(err, t('settings.twoFactorIncorrectPassword')));
      } else {
        setError(t('settings.twoFactorRegenError'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDisable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setLoading(true);
    setError('');
    try {
      await api.auth.disable2FA(password);
      onSuccess();
      onClose();
    } catch (err) {
      if (isApiError(err)) {
        setError(getErrorMessage(err, t('settings.twoFactorIncorrectPassword')));
      } else {
        setError(t('settings.twoFactorDisableError'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCopyAllCodes = () => {
    if (!recoveryCodes.length) return;
    const text = recoveryCodes.join('\n');
    navigator.clipboard.writeText(text);
    setCopiedCodes(true);
    setTimeout(() => setCopiedCodes(false), 2500);
  };

  const handleDownloadCodes = () => {
    if (!recoveryCodes.length) return;
    const content = `HubSight Two-Factor Authentication Backup Recovery Codes\nGenerated at: ${new Date().toISOString()}\n\nEach code can be used only once:\n\n${recoveryCodes
      .map((c, idx) => `${idx + 1}. ${c}`)
      .join('\n')}\n\nKeep these codes safe and confidential.`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `hubsight-backup-codes-${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden z-10 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-50 dark:bg-orange-950/40 border border-orange-200/60 dark:border-orange-500/30 flex items-center justify-center text-orange-600 dark:text-orange-500">
              {mode === 'disable' ? <ShieldAlert size={20} /> : <ShieldCheck size={20} />}
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-800 dark:text-slate-100">
                {mode === 'setup'
                  ? t('settings.twoFactorModalTitle')
                  : mode === 'regenerate'
                  ? t('settings.regenRecoveryBtn')
                  : t('settings.disable2faBtn')}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">{t('settings.twoFactorTitle')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl text-red-600 dark:text-red-400 text-xs flex items-center gap-2 animate-fade-in">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* STEP: Display Recovery Codes after enabling or regenerating */}
          {step === 'codes' ? (
            <div className="space-y-4">
              <div className="p-4 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-2xl">
                <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold text-sm">
                  <KeyRound size={18} className="text-amber-600 dark:text-amber-400" />
                  <span>{t('settings.recoveryCodesTitle')}</span>
                </div>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                  {t('settings.recoveryCodesDesc')}
                </p>
              </div>

              {/* Grid of codes */}
              <div className="grid grid-cols-2 gap-2.5 p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-2xl">
                {recoveryCodes.map((code, idx) => (
                  <div
                    key={idx}
                    className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-xl font-mono text-sm font-semibold text-slate-800 dark:text-slate-100 text-center tracking-wider shadow-2xs"
                  >
                    {code}
                  </div>
                ))}
              </div>

              {/* Actions: Copy & Download */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCopyAllCodes}
                  className="flex-1 py-2.5 px-3 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-2 shadow-2xs transition-colors cursor-pointer"
                >
                  {copiedCodes ? (
                    <>
                      <Check size={14} className="text-emerald-600 dark:text-emerald-400" />
                      <span className="text-emerald-600 dark:text-emerald-400">{t('settings.copiedCodes')}</span>
                    </>
                  ) : (
                    <>
                      <Copy size={14} />
                      <span>{t('settings.copyAllCodes')}</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadCodes}
                  className="flex-1 py-2.5 px-3 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-2 shadow-2xs transition-colors cursor-pointer"
                >
                  <Download size={14} />
                  <span>{t('settings.downloadCodes')}</span>
                </button>
              </div>

              {/* Confirmation checkbox */}
              <label className="flex items-start gap-3 p-3 bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-700 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasSavedCodes}
                  onChange={(e) => setHasSavedCodes(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 dark:border-slate-600 text-orange-600 focus:ring-orange-500"
                />
                <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                  {t('settings.confirmSavedCodes')}
                </span>
              </label>

              <button
                type="button"
                disabled={!hasSavedCodes}
                onClick={() => {
                  onSuccess();
                  onClose();
                }}
                className="w-full py-2.5 px-4 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-sm"
              >
                {t('ok')}
              </button>
            </div>
          ) : mode === 'setup' ? (
            /* Setup Flow: QR Code + Verification code input */
            loading && !setupData ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-3">
                <Loader2 size={28} className="animate-spin text-orange-600" />
                <span className="text-xs">{t('loading')}</span>
              </div>
            ) : setupData ? (
              <form onSubmit={handleEnable2FA} className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2.5">
                    {t('settings.twoFactorScanStep')}
                  </p>
                  <div className="flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl">
                    <img
                      src={setupData.qr_code}
                      alt="TOTP QR Code"
                      className="w-48 h-48 rounded-xl bg-white p-2 border border-slate-200 shadow-2xs"
                    />
                  </div>
                </div>

                {/* Secret key fallback */}
                <div className="space-y-1.5">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                    {t('settings.twoFactorManualKey')}
                  </p>
                  <div className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
                    <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-200 tracking-wider flex-1 select-all break-all">
                      {setupData.secret}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopySecret}
                      className="p-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer shrink-0"
                      title="Copy secret"
                    >
                      {copiedSecret ? <Check size={14} className="text-emerald-600 dark:text-emerald-400" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>

                {/* 6-digit confirmation code input */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                    {t('settings.twoFactorVerifyStep')}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    required
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    className="w-full text-center tracking-[0.4em] font-mono text-lg font-bold py-2.5 px-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading || verificationCode.length !== 6}
                    className="w-full py-2.5 px-4 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                  >
                    {loading && <Loader2 size={14} className="animate-spin" />}
                    <span>{t('settings.twoFactorVerifyBtn')}</span>
                  </button>
                </div>
              </form>
            ) : null
          ) : mode === 'regenerate' ? (
            /* Regenerate Backup Codes: Password confirmation */
            <form onSubmit={handleRegenerateCodes} className="space-y-4">
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {t('settings.regenConfirmPrompt')}
              </p>
              <div>
                <input
                  type="password"
                  required
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('login.passwordPlaceholder')}
                  className="w-full py-2.5 px-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl text-sm focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !password}
                className="w-full py-2.5 px-4 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                {loading && <Loader2 size={14} className="animate-spin" />}
                <span>{t('settings.regenRecoveryBtn')}</span>
              </button>
            </form>
          ) : (
            /* Disable 2FA: Password confirmation */
            <form onSubmit={handleDisable2FA} className="space-y-4">
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {t('settings.disableConfirmPrompt')}
              </p>
              <div>
                <input
                  type="password"
                  required
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('login.passwordPlaceholder')}
                  className="w-full py-2.5 px-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl text-sm focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !password}
                className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                {loading && <Loader2 size={14} className="animate-spin" />}
                <span>{t('settings.disable2faBtn')}</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
