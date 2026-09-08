import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from '../i18n';
import { api } from '../api/client';
import type { GoogleServiceAccount } from '@hubsight/sdk';
import {
  Cloud,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Trash2,
  Eye,
  RotateCw,
  X,
  Upload,
  FileCode,
  Shield,
  Clock,
} from '@/components/icons';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

export const GoogleServiceAccounts: React.FC = () => {
  const { t } = useTranslation();

  const [accounts, setAccounts] = useState<GoogleServiceAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modals state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [detailAccount, setDetailAccount] = useState<GoogleServiceAccount | null>(null);
  const [deleteAccount, setDeleteAccount] = useState<GoogleServiceAccount | null>(null);

  // Actions loading state
  const [testingId, setTestingId] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Import form state
  const [importTab, setImportTab] = useState<'upload' | 'paste'>('upload');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [jsonText, setJsonText] = useState('');
  const [customName, setCustomName] = useState('');
  const [setActiveOnImport, setSetActiveOnImport] = useState(true);
  const [jsonValidationError, setJsonValidationError] = useState<string | null>(null);
  const [parsedPreview, setParsedPreview] = useState<{
    project_id: string;
    client_email: string;
    private_key_id?: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch accounts on mount
  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const data = await api.googleServiceAccounts.list();
      setAccounts(data);
    } catch (err: any) {
      toast.error(err?.message || 'Không thể tải danh sách Google Service Accounts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  // Filter accounts
  const filteredAccounts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) =>
        a.project_id.toLowerCase().includes(q) ||
        a.client_email.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        (a.private_key_id && a.private_key_id.toLowerCase().includes(q)),
    );
  }, [accounts, search]);

  const activeAccount = useMemo(() => accounts.find((a) => a.is_active), [accounts]);

  // Copy helper
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success(t('serviceAccounts.copied'));
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Real-time JSON validation for Import modal
  const validateJsonString = (content: string) => {
    const trimmed = content.trim();
    if (!trimmed) {
      setJsonValidationError(null);
      setParsedPreview(null);
      return;
    }

    try {
      const obj = JSON.parse(trimmed);
      if (obj.type !== 'service_account') {
        setJsonValidationError(`Tệp không phải service_account (phát hiện type: '${obj.type || 'unknown'}')`);
        setParsedPreview(null);
        return;
      }
      if (!obj.project_id) {
        setJsonValidationError('Thiếu trường "project_id" trong file JSON.');
        setParsedPreview(null);
        return;
      }
      if (!obj.client_email) {
        setJsonValidationError('Thiếu trường "client_email" trong file JSON.');
        setParsedPreview(null);
        return;
      }
      if (!obj.private_key || !obj.private_key.includes('BEGIN PRIVATE KEY')) {
        setJsonValidationError('Trường "private_key" không đúng định dạng RSA PEM chuẩn.');
        setParsedPreview(null);
        return;
      }

      setJsonValidationError(null);
      setParsedPreview({
        project_id: obj.project_id,
        client_email: obj.client_email,
        private_key_id: obj.private_key_id,
      });

      if (!customName) {
        setCustomName(obj.project_id);
      }
    } catch {
      setJsonValidationError('Cú pháp JSON không hợp lệ. Vui lòng kiểm tra lại.');
      setParsedPreview(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setJsonText(content);
      validateJsonString(content);
    };
    reader.readAsText(file);
  };

  const handleJsonTextChange = (text: string) => {
    setJsonText(text);
    validateJsonString(text);
  };

  // Submit Import
  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jsonText.trim() || jsonValidationError || !parsedPreview) {
      toast.error('Vui lòng chọn hoặc dán file JSON Google Service Account hợp lệ');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await api.googleServiceAccounts.importJson({
        name: customName.trim() || parsedPreview.project_id,
        raw_json: jsonText.trim(),
        is_active: setActiveOnImport,
      });

      toast.success(res.message || 'Nhập Google Service Account thành công');
      if (res.warning) {
        toast(() => (
          <span className="text-amber-700 text-xs font-medium">
            ⚠️ {res.warning}
          </span>
        ));
      } else if (res.test_result) {
        toast.success(res.test_result);
      }

      setIsImportModalOpen(false);
      resetImportForm();
      await fetchAccounts();
    } catch (err: any) {
      toast.error(err?.message || 'Không thể nhập Service Account');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetImportForm = () => {
    setImportFile(null);
    setJsonText('');
    setCustomName('');
    setSetActiveOnImport(true);
    setJsonValidationError(null);
    setParsedPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Test connection
  const handleTestConnection = async (account: GoogleServiceAccount) => {
    try {
      setTestingId(account.id);
      const res = await api.googleServiceAccounts.test(account.id);
      if (res.success) {
        toast.success(`${t('serviceAccounts.testSuccess')} (${res.message})`);
      } else {
        toast.error(`${t('serviceAccounts.testFailed')}: ${res.message}`);
      }
      await fetchAccounts();
      if (detailAccount?.id === account.id) {
        const updated = await api.googleServiceAccounts.get(account.id);
        setDetailAccount(updated);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Kiểm tra kết nối thất bại');
    } finally {
      setTestingId(null);
    }
  };

  // Activate account
  const handleActivate = async (account: GoogleServiceAccount) => {
    try {
      setActivatingId(account.id);
      await api.googleServiceAccounts.activate(account.id);
      toast.success(t('serviceAccounts.activateSuccess'));
      await fetchAccounts();
      if (detailAccount?.id === account.id) {
        setDetailAccount({ ...detailAccount, is_active: true });
      }
    } catch (err: any) {
      toast.error(err?.message || 'Không thể kích hoạt tài khoản');
    } finally {
      setActivatingId(null);
    }
  };

  // Delete account
  const handleDelete = async () => {
    if (!deleteAccount) return;
    try {
      setIsDeleting(true);
      await api.googleServiceAccounts.delete(deleteAccount.id);
      toast.success(t('serviceAccounts.deleteSuccess'));
      setDeleteAccount(null);
      if (detailAccount?.id === deleteAccount.id) {
        setDetailAccount(null);
      }
      await fetchAccounts();
    } catch (err: any) {
      toast.error(err?.message || 'Không thể xóa tài khoản');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="w-full flex-1 flex flex-col p-4 sm:p-6 lg:p-8 overflow-y-auto custom-scrollbar">
      {/* ── Top Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-orange-50 border border-orange-200/70 flex items-center justify-center text-orange-600 shadow-2xs shrink-0">
            <Cloud size={22} />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
              {t('serviceAccounts.title')}
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                GCP / Firebase
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              {t('serviceAccounts.subtitle')}
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            resetImportForm();
            setIsImportModalOpen(true);
          }}
          className="btn flex items-center gap-2 cursor-pointer shadow-xs active:scale-95 shrink-0 whitespace-nowrap"
        >
          <Plus size={16} />
          <span>{t('serviceAccounts.importBtn')}</span>
        </button>
      </div>

      {/* ── Overview Metrics Cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5 my-6">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-700 shrink-0">
            <Cloud size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-slate-500">{t('serviceAccounts.total')}</p>
            <p className="text-lg font-bold text-slate-900">{accounts.length}</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600 shrink-0">
            <Shield size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-slate-500">{t('serviceAccounts.activeProject')}</p>
            <p className="text-sm font-bold text-slate-900 truncate" title={activeAccount?.project_id || '—'}>
              {activeAccount?.project_id || 'Chưa thiết lập'}
            </p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-3.5">
          <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
            activeAccount && activeAccount.status === 'active'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
              : activeAccount && activeAccount.status === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-600'
              : 'bg-slate-50 border-slate-200 text-slate-400'
          }`}>
            {activeAccount && activeAccount.status === 'active' ? (
              <CheckCircle2 size={18} />
            ) : activeAccount && activeAccount.status === 'error' ? (
              <AlertCircle size={18} />
            ) : (
              <RotateCw size={18} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-slate-500">{t('serviceAccounts.fcmStatus')}</p>
            <p className="text-sm font-bold text-slate-900 truncate">
              {activeAccount
                ? activeAccount.status === 'active'
                  ? 'Đã kết nối Google'
                  : activeAccount.status === 'error'
                  ? 'Lỗi kết nối'
                  : 'Chưa kiểm tra'
                : 'Chưa cấu hình'}
            </p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600 shrink-0">
            <Clock size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-slate-500">{t('serviceAccounts.lastTested')}</p>
            <p className="text-xs font-semibold text-slate-800 truncate">
              {activeAccount?.last_tested_at
                ? dayjs(activeAccount.last_tested_at).format('HH:mm DD/MM/YYYY')
                : 'Chưa kiểm tra'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Search Toolbar ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4">
        <div className="relative w-full sm:w-80">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={t('serviceAccounts.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all shadow-2xs"
          />
        </div>
      </div>

      {/* ── Content: Desktop Table & Mobile Cards ──────────────────────────── */}
      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center py-20 bg-white border border-slate-200 rounded-2xl">
          <RotateCw size={28} className="animate-spin text-orange-600 mb-3" />
          <p className="text-sm font-medium text-slate-500">Đang tải danh sách Google Service Accounts...</p>
        </div>
      ) : filteredAccounts.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-16 px-4 bg-white border border-slate-200 rounded-2xl text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
            <Cloud size={28} />
          </div>
          <h3 className="text-base font-bold text-slate-800 mb-1">
            {search ? 'Không tìm thấy tài khoản phù hợp' : t('serviceAccounts.noAccounts')}
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 max-w-md mb-5">
            {search ? 'Thử tìm kiếm với từ khóa khác' : t('serviceAccounts.noAccountsDesc')}
          </p>
          {!search && (
            <button
              onClick={() => {
                resetImportForm();
                setIsImportModalOpen(true);
              }}
              className="btn flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <Plus size={16} />
              <span>{t('serviceAccounts.importBtn')}</span>
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Desktop Table View (hidden on mobile) */}
          <div className="hidden md:block bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500 select-none whitespace-nowrap">
                    <th className="py-3 px-5 min-w-[260px]">{t('serviceAccounts.project')}</th>
                    <th className="py-3 px-5 min-w-[240px]">{t('serviceAccounts.clientEmail')}</th>
                    <th className="py-3 px-5 min-w-[120px]">{t('serviceAccounts.keyId')}</th>
                    <th className="py-3 px-5 min-w-[140px]">{t('serviceAccounts.status')}</th>
                    <th className="py-3 px-5 min-w-[160px] text-right">{t('serviceAccounts.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                  {filteredAccounts.map((acc) => (
                    <tr
                      key={acc.id}
                      className="hover:bg-slate-50/60 transition-colors cursor-pointer group"
                      onClick={() => setDetailAccount(acc)}
                    >
                      {/* Project & Friendly Name */}
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center font-bold text-xs shrink-0 border border-orange-100">
                            <Cloud size={15} />
                          </div>
                          <div className="min-w-0 flex flex-col gap-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-slate-800 text-sm group-hover:text-orange-600 transition-colors whitespace-nowrap">
                                {acc.name || acc.project_id}
                              </span>
                              {acc.is_active && (
                                <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full inline-flex items-center gap-1 shrink-0 whitespace-nowrap">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  {t('serviceAccounts.activeBadge')}
                                </span>
                              )}
                              {acc.client_email.includes('firebase-adminsdk') && (
                                <span className="text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full inline-flex items-center gap-1 shrink-0 whitespace-nowrap" title="Service Account tải trực tiếp từ Firebase Console">
                                  🔥 Firebase Admin SDK
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-slate-400 font-mono">
                              {acc.project_id}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Client Email */}
                      <td className="py-3.5 px-5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-slate-600 truncate max-w-[240px]" title={acc.client_email}>
                            {acc.client_email}
                          </span>
                          <button
                            onClick={() => handleCopy(acc.client_email, `email-${acc.id}`)}
                            className="p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
                            title="Sao chép email"
                          >
                            {copiedId === `email-${acc.id}` ? (
                              <Check size={13} className="text-emerald-600" />
                            ) : (
                              <Copy size={13} />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Key ID */}
                      <td className="py-3.5 px-5 whitespace-nowrap">
                        <span className="font-mono text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200 shrink-0">
                          {acc.private_key_id ? acc.private_key_id.slice(0, 10) + '...' : '—'}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-5 whitespace-nowrap">
                        <div className="flex flex-col gap-0.5">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold w-fit border shrink-0 whitespace-nowrap ${
                            acc.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : acc.status === 'error'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-slate-50 text-slate-600 border-slate-200'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              acc.status === 'active'
                                ? 'bg-emerald-500'
                                : acc.status === 'error'
                                ? 'bg-rose-500'
                                : 'bg-slate-400'
                            }`} />
                            <span>
                              {acc.status === 'active'
                                ? t('serviceAccounts.connected')
                                : acc.status === 'error'
                                ? t('serviceAccounts.error')
                                : t('serviceAccounts.untested')}
                            </span>
                          </span>
                          {acc.last_tested_at && (
                            <span className="text-[10px] text-slate-400 font-medium">
                              {dayjs(acc.last_tested_at).format('HH:mm DD/MM')}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5 shrink-0">
                          <button
                            onClick={() => handleTestConnection(acc)}
                            disabled={testingId === acc.id}
                            className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50 shrink-0"
                            title="Kiểm tra kết nối với Google STS"
                          >
                            <RotateCw size={12} className={testingId === acc.id ? 'animate-spin text-orange-600' : 'text-slate-500'} />
                            <span>{testingId === acc.id ? t('serviceAccounts.testing') : t('serviceAccounts.testBtn')}</span>
                          </button>

                          {!acc.is_active && (
                            <button
                              onClick={() => handleActivate(acc)}
                              disabled={activatingId === acc.id}
                              className="px-2.5 py-1 text-xs font-semibold text-orange-600 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 active:scale-95 transition-all cursor-pointer disabled:opacity-50 shrink-0"
                            >
                              {t('serviceAccounts.activateBtn')}
                            </button>
                          )}

                          <button
                            onClick={() => setDetailAccount(acc)}
                            className="p-1.5 text-slate-500 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors cursor-pointer shrink-0"
                            title={t('serviceAccounts.detailBtn')}
                          >
                            <Eye size={15} />
                          </button>

                          <button
                            onClick={() => setDeleteAccount(acc)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer shrink-0"
                            title={t('serviceAccounts.deleteBtn')}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card View (block on < 768px) */}
          <div className="block md:hidden space-y-3">
            {filteredAccounts.map((acc) => (
              <div
                key={acc.id}
                onClick={() => setDetailAccount(acc)}
                className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs cursor-pointer hover:border-orange-200 transition-all space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-100 text-orange-600 flex items-center justify-center font-bold text-sm shrink-0">
                      <Cloud size={18} />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-900 leading-tight">
                        {acc.name || acc.project_id}
                      </h4>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">
                        {acc.project_id}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    {acc.is_active && (
                      <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        {t('serviceAccounts.activeBadge')}
                      </span>
                    )}
                    {acc.client_email.includes('firebase-adminsdk') && (
                      <span className="text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                        🔥 Firebase Console
                      </span>
                    )}
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                      acc.status === 'active'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : acc.status === 'error'
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}>
                      {acc.status === 'active' ? 'Đã kết nối' : acc.status === 'error' ? 'Lỗi' : 'Chưa kiểm tra'}
                    </span>
                  </div>
                </div>

                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/60 font-mono text-xs flex items-center justify-between gap-2">
                  <span className="text-slate-600 truncate">{acc.client_email}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopy(acc.client_email, `m-email-${acc.id}`);
                    }}
                    className="p-1 text-slate-400 hover:text-slate-600 shrink-0"
                  >
                    {copiedId === `m-email-${acc.id}` ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                  </button>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => handleTestConnection(acc)}
                    disabled={testingId === acc.id}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 flex items-center gap-1.5"
                  >
                    <RotateCw size={12} className={testingId === acc.id ? 'animate-spin text-orange-600' : ''} />
                    <span>{t('serviceAccounts.testBtn')}</span>
                  </button>

                  <div className="flex items-center gap-2">
                    {!acc.is_active && (
                      <button
                        onClick={() => handleActivate(acc)}
                        disabled={activatingId === acc.id}
                        className="px-3 py-1.5 text-xs font-semibold text-orange-600 bg-orange-50 border border-orange-200 rounded-xl hover:bg-orange-100"
                      >
                        {t('serviceAccounts.activateBtn')}
                      </button>
                    )}
                    <button
                      onClick={() => setDeleteAccount(acc)}
                      className="p-2 text-slate-400 hover:text-red-600 rounded-xl"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── MODAL: Import Google Service Account ───────────────────────────── */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="fixed inset-0" onClick={() => setIsImportModalOpen(false)} />
          <div className="relative w-full max-w-xl bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden z-10 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-200/80 text-orange-600 flex items-center justify-center shadow-2xs">
                  <Cloud size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">
                    {t('serviceAccounts.importModalTitle')}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {t('serviceAccounts.importModalSubtitle')}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleImportSubmit} className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
              {/* Firebase Console Guide Box */}
              <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/80 text-xs text-amber-950 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-amber-900">
                  <Shield size={14} className="text-amber-600 shrink-0" />
                  <span>Nguồn tệp: Tải trực tiếp từ Firebase Console</span>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-[11px] text-amber-900/90 pl-1 leading-relaxed">
                  <li>Truy cập <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" className="font-semibold underline hover:text-amber-800">console.firebase.google.com</a> và chọn dự án.</li>
                  <li>Bấm biểu tượng <b>Cài đặt (bánh răng ⚙️)</b> &gt; Chọn <b>Cài đặt dự án (Project settings)</b>.</li>
                  <li>Chuyển sang tab <b>Tài khoản dịch vụ (Service accounts)</b>.</li>
                  <li>Bấm nút <b>Tạo khóa riêng tư mới (Generate new private key)</b> và tải file JSON về máy tính.</li>
                </ol>
              </div>

              {/* Tab Selector: Upload File or Paste JSON */}
              <div className="flex rounded-xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setImportTab('upload')}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    importTab === 'upload'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Upload size={14} />
                  <span>{t('serviceAccounts.uploadTab')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setImportTab('paste')}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    importTab === 'paste'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <FileCode size={14} />
                  <span>{t('serviceAccounts.pasteTab')}</span>
                </button>
              </div>

              {/* Tab 1: Upload File */}
              {importTab === 'upload' && (
                <div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".json,application/json"
                    onChange={handleFileChange}
                    className="hidden"
                    id="gsa-file-upload"
                  />
                  <label
                    htmlFor="gsa-file-upload"
                    className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 hover:border-orange-500 hover:bg-orange-50/20 rounded-2xl p-6 text-center cursor-pointer transition-all"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center mb-2">
                      <Upload size={22} />
                    </div>
                    {importFile ? (
                      <div>
                        <p className="text-xs font-bold text-slate-800 flex items-center justify-center gap-1.5">
                          <Check size={14} className="text-emerald-600" />
                          {importFile.name}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {(importFile.size / 1024).toFixed(1)} KB • Bấm để chọn file khác
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs font-bold text-slate-700">
                          {t('serviceAccounts.dragDropTitle')}
                        </p>
                        <span className="inline-block mt-1.5 text-xs font-semibold text-orange-600 bg-orange-50 hover:bg-orange-100 px-3 py-1 rounded-lg border border-orange-200 transition-colors">
                          {t('serviceAccounts.browseBtn')}
                        </span>
                      </div>
                    )}
                  </label>
                </div>
              )}

              {/* Tab 2: Paste JSON */}
              {importTab === 'paste' && (
                <div>
                  <textarea
                    rows={6}
                    placeholder={t('serviceAccounts.pastePlaceholder')}
                    value={jsonText}
                    onChange={(e) => handleJsonTextChange(e.target.value)}
                    className="w-full p-3 font-mono text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all resize-y"
                  />
                </div>
              )}

              {/* Real-time Validation Status Alert */}
              {jsonValidationError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2 animate-fade-in">
                  <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-500" />
                  <span>{jsonValidationError}</span>
                </div>
              )}

              {parsedPreview && !jsonValidationError && (
                <div className="p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200/80 text-xs text-emerald-900 space-y-1.5 animate-fade-in">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-800">
                    <CheckCircle2 size={15} className="text-emerald-600" />
                    <span>{t('serviceAccounts.jsonValid')}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                    <div>
                      <span className="text-emerald-600 font-medium">Project ID:</span>{' '}
                      <span className="font-mono font-bold text-emerald-950">{parsedPreview.project_id}</span>
                    </div>
                    <div>
                      <span className="text-emerald-600 font-medium">Key ID:</span>{' '}
                      <span className="font-mono text-emerald-950">{parsedPreview.private_key_id?.slice(0, 10)}...</span>
                    </div>
                    <div className="col-span-2 truncate">
                      <span className="text-emerald-600 font-medium">Email:</span>{' '}
                      <span className="font-mono text-emerald-950">{parsedPreview.client_email}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Friendly Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  {t('serviceAccounts.friendlyName')}
                </label>
                <input
                  type="text"
                  placeholder={t('serviceAccounts.friendlyNamePlaceholder')}
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                />
              </div>

              {/* Set Active Checkbox */}
              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={setActiveOnImport}
                  onChange={(e) => setSetActiveOnImport(e.target.checked)}
                  className="w-4 h-4 text-orange-600 rounded border-slate-300 focus:ring-orange-500 cursor-pointer"
                />
                <span className="text-xs font-semibold text-slate-700">
                  {t('serviceAccounts.setActiveCheckbox')}
                </span>
              </label>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !parsedPreview || !!jsonValidationError}
                  className="btn flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <RotateCw size={14} className="animate-spin" />
                      <span>{t('serviceAccounts.importing')}</span>
                    </>
                  ) : (
                    <>
                      <Check size={14} />
                      <span>{t('serviceAccounts.submitImport')}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: Detail View ─────────────────────────────────────────────── */}
      {detailAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="fixed inset-0" onClick={() => setDetailAccount(null)} />
          <div className="relative w-full max-w-2xl bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden z-10 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-200 text-orange-600 flex items-center justify-center">
                  <Cloud size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                    {detailAccount.name || detailAccount.project_id}
                    {detailAccount.is_active && (
                      <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                        {t('serviceAccounts.activeBadge')}
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-500">{t('serviceAccounts.detailSubtitle')}</p>
                </div>
              </div>
              <button
                onClick={() => setDetailAccount(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4 text-xs">
              {/* Credentials details */}
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70">
                    <span className="text-[11px] text-slate-400 block font-medium">Project ID</span>
                    <span className="font-mono font-bold text-slate-800 text-sm">{detailAccount.project_id}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70">
                    <span className="text-[11px] text-slate-400 block font-medium">Private Key ID</span>
                    <span className="font-mono text-slate-800 text-xs truncate block" title={detailAccount.private_key_id}>
                      {detailAccount.private_key_id || '—'}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-slate-400 font-medium">{t('serviceAccounts.clientEmail')}</span>
                    <button
                      onClick={() => handleCopy(detailAccount.client_email, 'detail-email')}
                      className="text-orange-600 hover:text-orange-700 font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Copy size={12} />
                      <span>{copiedId === 'detail-email' ? 'Đã copy' : 'Copy'}</span>
                    </button>
                  </div>
                  <span className="font-mono text-slate-800 font-semibold break-all">
                    {detailAccount.client_email}
                  </span>
                </div>

                {detailAccount.client_id && (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70">
                    <span className="text-[11px] text-slate-400 block font-medium">{t('serviceAccounts.clientId')}</span>
                    <span className="font-mono text-slate-800 text-xs">{detailAccount.client_id}</span>
                  </div>
                )}

                {/* Masked Private key */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-slate-400 font-medium">{t('serviceAccounts.privateKey')}</span>
                    <span className="text-[10px] text-slate-400 italic">{t('serviceAccounts.maskedKeyNote')}</span>
                  </div>
                  <div className="font-mono text-[11px] text-slate-500 bg-white p-2.5 rounded-lg border border-slate-200 select-all">
                    -----BEGIN RSA PRIVATE KEY-----<br />
                    ••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••<br />
                    ••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••<br />
                    -----END RSA PRIVATE KEY-----
                  </div>
                </div>

                {/* Connection Status Box */}
                <div className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                  detailAccount.status === 'active'
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                    : detailAccount.status === 'error'
                    ? 'bg-rose-50/70 border-rose-200 text-rose-900'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}>
                  {detailAccount.status === 'active' ? (
                    <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                  ) : detailAccount.status === 'error' ? (
                    <AlertCircle size={18} className="text-rose-600 shrink-0 mt-0.5" />
                  ) : (
                    <Clock size={18} className="text-slate-400 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-xs">
                      {detailAccount.status === 'active'
                        ? 'Google OAuth2 STS: Xác thực hợp lệ'
                        : detailAccount.status === 'error'
                        ? 'Google OAuth2 STS: Lỗi xác thực'
                        : 'Google OAuth2 STS: Chưa kiểm tra'}
                    </p>
                    {detailAccount.last_error && (
                      <p className="text-[11px] font-mono mt-1 text-rose-700 break-all">
                        {detailAccount.last_error}
                      </p>
                    )}
                    {detailAccount.last_tested_at && (
                      <p className="text-[10px] text-slate-400 mt-1">
                        Kiểm tra lần cuối: {dayjs(detailAccount.last_tested_at).format('HH:mm:ss DD/MM/YYYY')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/60 shrink-0">
              <button
                onClick={() => handleTestConnection(detailAccount)}
                disabled={testingId === detailAccount.id}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <RotateCw size={13} className={testingId === detailAccount.id ? 'animate-spin text-orange-600' : ''} />
                <span>{testingId === detailAccount.id ? t('serviceAccounts.testing') : t('serviceAccounts.testBtn')}</span>
              </button>

              <div className="flex items-center gap-2">
                {!detailAccount.is_active && (
                  <button
                    onClick={() => handleActivate(detailAccount)}
                    disabled={activatingId === detailAccount.id}
                    className="px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-xl transition-colors cursor-pointer shadow-xs"
                  >
                    {t('serviceAccounts.activateBtn')}
                  </button>
                )}
                <button
                  onClick={() => setDetailAccount(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  {t('close')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Delete Confirmation ────────────────────────────────────── */}
      {deleteAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="fixed inset-0" onClick={() => setDeleteAccount(null)} />
          <div className="relative w-full max-w-md bg-white border border-slate-200 rounded-3xl shadow-2xl p-6 z-10 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center">
              <Trash2 size={24} />
            </div>
            <div>
              <h3 className="font-bold text-lg text-slate-900">
                {t('serviceAccounts.deleteConfirmTitle')}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                {t('serviceAccounts.deleteConfirmMsg')}
              </p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 font-mono text-xs text-slate-800">
              <p className="font-bold">{deleteAccount.name || deleteAccount.project_id}</p>
              <p className="text-slate-500 text-[11px] truncate mt-0.5">{deleteAccount.client_email}</p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteAccount(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-1.5"
              >
                {isDeleting && <RotateCw size={13} className="animate-spin" />}
                <span>{t('delete')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GoogleServiceAccounts;
