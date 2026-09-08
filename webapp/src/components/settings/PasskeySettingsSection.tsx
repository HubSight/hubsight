import React, { useState, useEffect } from 'react';
import {
  KeyRound,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
} from '@/components/icons';
import { api } from '../../api/client';
import { isApiError, getErrorMessage, isPasskeySupported } from '@hubsight/sdk';
import { useTranslation } from '../../i18n';
import type { PasskeyItem } from '@hubsight/sdk';

export const PasskeySettingsSection: React.FC = () => {
  const { t } = useTranslation();

  const [passkeys, setPasskeys] = useState<PasskeyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [supported, setSupported] = useState<boolean | null>(null);

  // Add dialog state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newPasskeyName, setNewPasskeyName] = useState('');

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    isPasskeySupported().then(setSupported);
    loadPasskeys();
  }, []);

  const loadPasskeys = async () => {
    setLoading(true);
    try {
      const list = await api.auth.listPasskeys();
      setPasskeys(list || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAddModal = () => {
    const defaultName = typeof navigator !== 'undefined' && navigator.userAgent.includes('Macintosh')
      ? 'MacBook Touch ID'
      : typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows')
      ? 'Windows Hello'
      : 'Khóa bảo mật';
    setNewPasskeyName(defaultName);
    setError('');
    setSuccess('');
    setShowAddModal(true);
  };

  const handleRegisterPasskey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPasskeyName.trim()) return;

    setRegistering(true);
    setError('');
    setSuccess('');

    try {
      const newKey = await api.auth.registerPasskey(newPasskeyName.trim());
      setPasskeys((prev) => [newKey, ...prev]);
      setSuccess(t('settings.registerPasskeySuccess'));
      setShowAddModal(false);
      setTimeout(() => setSuccess(''), 4000);
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.message?.includes('cancel')) {
        // User canceled browser WebAuthn prompt
        setShowAddModal(false);
        return;
      }
      if (isApiError(err)) {
        setError(getErrorMessage(err, 'Không thể liên kết thiết bị'));
      } else {
        setError(err?.message || 'Không thể liên kết trên thiết bị này');
      }
    } finally {
      setRegistering(false);
    }
  };

  const handleStartRename = (item: PasskeyItem) => {
    setEditingId(item.id);
    setEditingName(item.name);
  };

  const handleSaveRename = async (id: string) => {
    if (!editingName.trim()) return;
    setActionLoading(true);
    try {
      await api.auth.renamePasskey(id, editingName.trim());
      setPasskeys((prev) =>
        prev.map((k) => (k.id === id ? { ...k, name: editingName.trim() } : k))
      );
      setEditingId(null);
    } catch (err) {
      if (isApiError(err)) {
        setError(getErrorMessage(err, 'Lỗi đổi tên thiết bị'));
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('settings.confirmDeletePasskey'))) return;
    setActionLoading(true);
    try {
      await api.auth.deletePasskey(id);
      setPasskeys((prev) => prev.filter((k) => k.id !== id));
    } catch (err) {
      if (isApiError(err)) {
        setError(getErrorMessage(err, 'Lỗi xóa thiết bị'));
      }
    } finally {
      setActionLoading(false);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return t('settings.passkeyNeverUsed');
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="p-4 bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 rounded-2xl space-y-3.5">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
            <KeyRound size={16} className="text-orange-600 shrink-0" />
            <span>{t('settings.passkeyTitle')}</span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('settings.passkeySubtitle')}
          </p>
        </div>

        {supported !== false && (
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-semibold shadow-2xs transition-all cursor-pointer shrink-0"
          >
            <Plus size={14} />
            <span>{t('settings.addPasskeyBtn')}</span>
          </button>
        )}
      </div>

      {supported === false && (
        <div className="p-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-xl text-amber-800 dark:text-amber-300 text-[11px] flex items-center gap-2">
          <ShieldAlert size={14} className="shrink-0 text-amber-600" />
          <span>{t('login.passkeyNotSupported')}</span>
        </div>
      )}

      {/* Notifications */}
      {success && (
        <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-emerald-700 dark:text-emerald-400 text-xs flex items-center gap-2 animate-fade-in">
          <CheckCircle2 size={14} className="shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="p-2.5 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-xl text-red-600 dark:text-red-400 text-xs flex items-center gap-2 animate-fade-in">
          <AlertCircle size={14} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Passkey list */}
      <div className="space-y-2 pt-1">
        {loading && passkeys.length === 0 ? (
          <div className="flex items-center justify-center py-4 text-slate-400 gap-2">
            <Loader2 size={16} className="animate-spin text-orange-600" />
            <span className="text-xs">{t('loading')}</span>
          </div>
        ) : passkeys.length === 0 ? (
          <div className="p-4 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-center">
            <p className="text-xs text-slate-400 dark:text-slate-500">{t('settings.noPasskeys')}</p>
          </div>
        ) : (
          passkeys.map((key) => (
            <div
              key={key.id}
              className="p-3 bg-white dark:bg-slate-800/80 border border-slate-200/90 dark:border-slate-700 rounded-xl flex items-center justify-between gap-3 shadow-2xs hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="w-8 h-8 rounded-lg bg-orange-50 dark:bg-orange-950/40 border border-orange-200/50 dark:border-orange-500/30 flex items-center justify-center text-orange-600 dark:text-orange-500 shrink-0">
                  <KeyRound size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  {editingId === key.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        autoFocus
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="text-xs font-semibold py-1 px-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded-lg w-full focus:outline-none focus:border-orange-500"
                      />
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => handleSaveRename(key.id)}
                        className="p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                        {key.name}
                      </p>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                        <span>
                          {t('settings.passkeyCreated')}: {formatDate(key.created_at)}
                        </span>
                        {key.last_used_at && (
                          <>
                            <span>•</span>
                            <span>
                              {t('settings.passkeyLastUsed')}: {formatDate(key.last_used_at)}
                            </span>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {editingId !== key.id && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleStartRename(key)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 rounded-lg transition-colors cursor-pointer"
                    title={t('settings.renamePasskey')}
                  >
                    <Edit2 size={13} />
                  </button>
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleDelete(key.id)}
                    className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors cursor-pointer"
                    title={t('settings.deletePasskey')}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Add Passkey Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div
            className="fixed inset-0"
            onClick={() => !registering && setShowAddModal(false)}
            aria-hidden="true"
          />

          <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-5 z-10 space-y-4 text-slate-800 dark:text-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound size={18} className="text-orange-600" />
                <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100">
                  {t('settings.addPasskeyBtn')}
                </h4>
              </div>
              <button
                type="button"
                disabled={registering}
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleRegisterPasskey} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('settings.passkeyNamePrompt')}
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newPasskeyName}
                  onChange={(e) => setNewPasskeyName(e.target.value)}
                  placeholder={t('settings.passkeyNamePlaceholder')}
                  className="w-full py-2 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={registering}
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-transparent dark:border-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={registering || !newPasskeyName.trim()}
                  className="flex-1 py-2 px-3 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                >
                  {registering && <Loader2 size={13} className="animate-spin" />}
                  <span>{t('confirm')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
