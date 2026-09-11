import React, { useState, useEffect } from 'react';
import {
  Monitor,
  Smartphone,
  Globe,
  LogOut,
  RotateCw,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Clock,
  X,
  Loader2,
  ChevronDown,
  ChevronUp,
} from '@/components/icons';
import { api } from '../../api/client';
import { isApiError, getErrorMessage } from '@hubsight/sdk';
import { useTranslation } from '../../i18n';
import type { SessionItem } from '@hubsight/sdk';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

export const SessionsSettingsSection: React.FC = () => {
  const { t } = useTranslation();

  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPastSessions, setShowPastSessions] = useState(false);

  // Modal confirmation states
  const [targetSession, setTargetSession] = useState<SessionItem | null>(null);
  const [showRevokeAllModal, setShowRevokeAllModal] = useState(false);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    setLoading(true);
    setError('');
    try {
      const list = await api.auth.listSessions();
      setSessions(list || []);
    } catch (err) {
      if (isApiError(err)) {
        setError(getErrorMessage(err, 'Không thể tải danh sách phiên đăng nhập.'));
      } else {
        setError('Không thể kết nối máy chủ để lấy danh sách phiên.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeSingle = async () => {
    if (!targetSession || actionLoading) return;
    setActionLoading(true);
    setError('');
    setSuccess('');

    try {
      await api.auth.revokeSession(targetSession.id);
      setSuccess(t('sessions.revokedSuccess'));
      setTargetSession(null);
      await loadSessions();
      setTimeout(() => setSuccess(''), 4000);
    } catch (err: any) {
      if (isApiError(err)) {
        setError(getErrorMessage(err, 'Lỗi khi thu hồi phiên đăng nhập.'));
      } else {
        setError(err?.message || 'Lỗi khi thu hồi phiên đăng nhập.');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevokeAllOthers = async () => {
    if (actionLoading) return;
    setActionLoading(true);
    setError('');
    setSuccess('');

    try {
      await api.auth.revokeAllOtherSessions();
      setSuccess(t('sessions.revokeAllOthersSuccess'));
      setShowRevokeAllModal(false);
      await loadSessions();
      setTimeout(() => setSuccess(''), 4000);
    } catch (err: any) {
      if (isApiError(err)) {
        setError(getErrorMessage(err, 'Lỗi khi thu hồi các phiên khác.'));
      } else {
        setError(err?.message || 'Lỗi khi thu hồi các phiên khác.');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const activeSessions = sessions.filter((s) => s.is_active);
  const pastSessions = sessions.filter((s) => !s.is_active);

  const getDeviceIcon = (clientType: string) => {
    if (clientType.startsWith('desktop_') || clientType === 'desktop_app') {
      return <Monitor size={18} />;
    }
    if (clientType.startsWith('mobile_')) {
      return <Smartphone size={18} />;
    }
    return <Globe size={18} />;
  };

  const getRevokeReasonText = (reason?: string) => {
    switch (reason) {
      case 'user_logout':
        return t('sessions.reasonUserLogout');
      case 'admin_revoke':
        return t('sessions.reasonAdminRevoke');
      case 'concurrent_limit':
        return t('sessions.reasonConcurrentLimit');
      case 'anomaly_detected':
        return t('sessions.reasonAnomalyDetected');
      case 'expired':
        return t('sessions.reasonExpired');
      default:
        return reason || t('sessions.ended');
    }
  };

  return (
    <div className="space-y-6">
      {/* ── SECTION HEADER & OVERVIEW ── */}
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-md bg-orange-50 dark:bg-orange-950/40 border border-orange-200/80 dark:border-orange-500/30 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0 shadow-2xs">
              <ShieldCheck size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                  {t('sessions.title')}
                </h2>
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60">
                  {activeSessions.length} {t('sessions.activeCount')}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t('sessions.subtitle')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={loadSessions}
              disabled={loading}
              className="w-9 h-9 min-w-9 min-h-9 aspect-square flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
              title={t('sessions.refreshBtn')}
            >
              <RotateCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>

            {activeSessions.length > 1 && (
              <button
                type="button"
                onClick={() => setShowRevokeAllModal(true)}
                disabled={actionLoading}
                className="h-9 flex items-center gap-1.5 px-3.5 rounded-md text-xs font-semibold bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 transition-colors cursor-pointer"
              >
                <LogOut size={14} />
                <span>{t('sessions.revokeAllOthersBtn')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Feedback alerts */}
        {error && (
          <div className="mt-4 p-3 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 flex items-center gap-2.5 text-xs text-red-700 dark:text-red-400">
            <AlertCircle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mt-4 p-3 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 flex items-center gap-2.5 text-xs text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 size={15} className="shrink-0" />
            <span>{success}</span>
          </div>
        )}
      </div>

      {/* ── ACTIVE SESSIONS LIST ── */}
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {t('sessions.active')} ({activeSessions.length})
          </h3>
        </div>

        {loading && activeSessions.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
            <Loader2 size={24} className="animate-spin text-orange-500" />
            <span className="text-xs">{t('loading')}</span>
          </div>
        ) : activeSessions.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            {t('sessions.noActiveSessions')}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {activeSessions.map((s) => (
              <div
                key={s.id}
                className={`p-4 rounded-md border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                  s.is_current
                    ? 'bg-orange-50/40 dark:bg-orange-950/20 border-orange-300 dark:border-orange-500/40 shadow-2xs'
                    : 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-md flex items-center justify-center shrink-0 ${
                      s.is_current
                        ? 'bg-orange-600 text-white shadow-2xs'
                        : 'bg-slate-200/80 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {getDeviceIcon(s.client_type)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                        {s.device_label || 'Trình duyệt Web'}
                      </span>
                      {s.is_current && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-orange-600 text-white shadow-2xs">
                          {t('sessions.currentDevice')}
                        </span>
                      )}
                      {s.is_new_device && !s.is_current && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60">
                          {t('sessions.newDeviceBadge')}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-1 flex-wrap font-mono">
                      <span>IP: {s.ip_address || '127.0.0.1'}</span>
                      <span>•</span>
                      <span>
                        {s.geo_city && s.geo_country
                          ? `${s.geo_city}, ${s.geo_country}`
                          : s.geo_city || 'Mạng nội bộ (LAN)'}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-slate-400 dark:text-slate-500 mt-1 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {t('sessions.loggedInAt')}: {dayjs(s.created_at).format('DD/MM/YYYY HH:mm')}
                      </span>
                      {s.last_active_at && (
                        <>
                          <span>•</span>
                          <span>
                            {t('sessions.lastActive')}: {dayjs(s.last_active_at).fromNow()}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Revoke Action */}
                <div className="shrink-0 flex items-center self-end md:self-center">
                  {s.is_current ? (
                    <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded">
                      {t('sessions.active')}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setTargetSession(s)}
                      disabled={actionLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold text-red-600 hover:text-white dark:text-red-400 hover:bg-red-600 dark:hover:bg-red-600 border border-red-200 dark:border-red-800/60 hover:border-transparent transition-all cursor-pointer"
                    >
                      <LogOut size={13} />
                      <span>{t('sessions.revokeBtn')}</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── PAST SESSIONS AUDIT LOG (IMMUTABLE HISTORY) ── */}
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6 shadow-2xs space-y-4">
        <button
          type="button"
          onClick={() => setShowPastSessions(!showPastSessions)}
          className="w-full flex items-center justify-between text-left cursor-pointer group"
        >
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 group-hover:text-orange-600 transition-colors">
                {t('sessions.pastSessionsTitle')}
              </h3>
              <span className="px-2 py-0.2 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                {pastSessions.length}
              </span>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
              {t('sessions.pastSessionsSubtitle')}
            </p>
          </div>

          <div className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 group-hover:bg-slate-100 dark:group-hover:bg-slate-800 transition-colors">
            {showPastSessions ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </button>

        {showPastSessions && (
          <div className="pt-2 animate-fade-in">
            {pastSessions.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                {t('sessions.noPastSessions')}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-2.5 px-3">Thiết bị & Nền tảng</th>
                      <th className="py-2.5 px-3">IP & Địa điểm</th>
                      <th className="py-2.5 px-3">Thời gian đăng nhập</th>
                      <th className="py-2.5 px-3">Thời gian kết thúc</th>
                      <th className="py-2.5 px-3">Lý do kết thúc</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {pastSessions.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                        <td className="py-2.5 px-3 font-medium text-slate-800 dark:text-slate-200">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-400">{getDeviceIcon(s.client_type)}</span>
                            <span>{s.device_label || 'Trình duyệt Web'}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 font-mono text-[11px]">
                          {s.ip_address} • {s.geo_city || 'LAN'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">
                          {dayjs(s.created_at).format('DD/MM/YYYY HH:mm')}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">
                          {s.revoked_at ? dayjs(s.revoked_at).format('DD/MM/YYYY HH:mm') : '—'}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200/80 dark:border-slate-700/60">
                            {getRevokeReasonText(s.revoke_reason)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── MODAL: CONFIRM REVOKE SINGLE SESSION ── */}
      {targetSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-red-600 dark:text-red-400">
                <AlertCircle size={20} />
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {t('sessions.confirmRevokeTitle')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setTargetSession(null)}
                className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {t('sessions.confirmRevokeDesc')}
            </p>

            <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs space-y-1">
              <div className="font-bold text-slate-800 dark:text-slate-200">
                {targetSession.device_label || 'Thiết bị'}
              </div>
              <div className="text-slate-500 font-mono text-[11px]">
                IP: {targetSession.ip_address} ({targetSession.geo_city || 'LAN'})
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTargetSession(null)}
                disabled={actionLoading}
                className="px-4 py-2 rounded-md text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={handleRevokeSingle}
                disabled={actionLoading}
                className="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors cursor-pointer shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading && <Loader2 size={13} className="animate-spin" />}
                <span>{actionLoading ? t('loading') : t('sessions.revokeBtn')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: CONFIRM REVOKE ALL OTHER SESSIONS ── */}
      {showRevokeAllModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-red-600 dark:text-red-400">
                <AlertCircle size={20} />
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {t('sessions.confirmRevokeAllTitle')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRevokeAllModal(false)}
                className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {t('sessions.confirmRevokeAllDesc')}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowRevokeAllModal(false)}
                disabled={actionLoading}
                className="px-4 py-2 rounded-md text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={handleRevokeAllOthers}
                disabled={actionLoading}
                className="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors cursor-pointer shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading && <Loader2 size={13} className="animate-spin" />}
                <span>{actionLoading ? t('loading') : t('confirm')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
