import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { useOnRecognitionLog, useOnMemberFaceUpdated } from '@hubsight/sdk/react';
import { api } from '../../api/client';
import { useTimezone } from '../../context/TimezoneContext';
import { useTranslation } from '../../i18n';
import type { TranslationKey } from '../../i18n/vi';
import type { RecognitionLogItem } from '../../types/recognitionLog';
import { ConfirmDialog } from '../common/ConfirmDialog';

interface RecognitionLogSidebarProps {
  cameraId: string;
  variant?: 'card' | 'docked';
}

const CATEGORY_STYLES: Record<string, { bar: string; text: string; bg: string; border: string }> = {
  member: {
    bar: 'bg-emerald-500',
    text: 'text-emerald-800',
    bg: 'bg-emerald-50/70',
    border: 'border-emerald-200',
  },
  guest: {
    bar: 'bg-blue-500',
    text: 'text-blue-800',
    bg: 'bg-blue-50/70',
    border: 'border-blue-200',
  },
  stranger: {
    bar: 'bg-red-500',
    text: 'text-red-800',
    bg: 'bg-red-50/70',
    border: 'border-red-200',
  },
  risk: {
    bar: 'bg-orange-500',
    text: 'text-orange-800',
    bg: 'bg-orange-50/70',
    border: 'border-orange-200',
  },
  fall: {
    bar: 'bg-rose-500',
    text: 'text-rose-800',
    bg: 'bg-rose-50/70',
    border: 'border-rose-200',
  },
  suspicious: {
    bar: 'bg-amber-500',
    text: 'text-amber-800',
    bg: 'bg-amber-50/70',
    border: 'border-amber-200',
  },
};

export const RecognitionLogSidebar: React.FC<RecognitionLogSidebarProps> = ({ cameraId, variant = 'card' }) => {
  const { t } = useTranslation();
  const { formatTime } = useTimezone();
  const navigate = useNavigate();

  const [logs, setLogs] = useState<RecognitionLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  const fetchLogs = useCallback(async (id: string) => {
    setLoading(true);
    setError(false);
    try {
      setLogs(await api.cameras.recognitionLogs(id));
    } catch (err) {
      console.error('Failed to fetch recognition logs:', err);
      setError(true);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!cameraId) return;
    fetchLogs(cameraId);
  }, [cameraId, fetchLogs]);

  useOnRecognitionLog((item) => {
    if (!item || item.camera_id !== cameraId) return;
    setLogs((prev) => [item, ...prev.filter((l) => l.id !== item.id)]);
  }, [cameraId]);

  useOnMemberFaceUpdated(() => {
    if (cameraId) fetchLogs(cameraId);
  }, [cameraId, fetchLogs]);

  const renderMessage = (item: RecognitionLogItem) => {
    const key = item.message_key as TranslationKey;
    return t(key, item.message_params || {});
  };

  const handleClick = (item: RecognitionLogItem) => {
    const ts = new Date(item.created_at).getTime();
    if (Number.isNaN(ts)) return;
    navigate(`/playback?camera_id=${item.camera_id}&t=${ts}`);
  };

  const handleClear = async () => {
    if (!cameraId) return;
    setClearing(true);
    try {
      await api.cameras.clearRecognitionLogs(cameraId);
      setLogs([]);
      setConfirmClear(false);
    } catch (err) {
      console.error('Failed to clear recognition logs:', err);
    } finally {
      setClearing(false);
    }
  };

  const isDocked = variant === 'docked';

  return (
    <aside
      className={
        isDocked
          ? 'flex flex-col h-full min-h-0 w-full bg-white overflow-hidden'
          : 'flex flex-col h-[40vh] bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden'
      }
    >
      <div className={`px-4 border-b border-slate-100 shrink-0 flex items-center justify-between gap-2 ${isDocked ? 'py-4' : 'py-3'}`}>
        <h3 className={`font-semibold text-slate-800 tracking-tight ${isDocked ? 'text-[15px]' : 'text-sm'}`}>
          {t('log.title')}
        </h3>
        {logs.length > 0 && (
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-red-600 cursor-pointer transition-colors"
            title={t('log.clear')}
          >
            <Trash2 size={13} />
            {t('log.clear')}
          </button>
        )}
      </div>
      <div className={`flex-1 overflow-y-auto space-y-2.5 playback-scrollbar ${isDocked ? 'p-4' : 'p-3'}`}>
        {loading && logs.length === 0 ? (
          <div className="space-y-2 p-1">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />
            ))}
            <p className="text-[11px] text-slate-400 text-center pt-2">{t('log.loading')}</p>
          </div>
        ) : error && logs.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-10">{t('log.error')}</p>
        ) : logs.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-10">{t('log.empty')}</p>
        ) : (
          logs.map((item) => {
            const style = CATEGORY_STYLES[item.category] || CATEGORY_STYLES.member;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleClick(item)}
                className={`w-full text-left relative overflow-hidden rounded-xl border cursor-pointer transition-colors ${style.bg} ${style.border} hover:brightness-[0.98] ${isDocked ? 'px-3.5 py-3' : 'px-3 py-2.5'}`}
              >
                <span className={`absolute top-0 bottom-0 left-0 w-1 ${style.bar}`} />
                <div className="pl-1.5">
                  <div className="text-[10px] font-mono text-slate-400 mb-0.5">
                    {formatTime(item.created_at)}
                  </div>
                  <p className={`leading-snug font-medium ${style.text} ${isDocked ? 'text-[13px]' : 'text-[12px]'}`}>
                    {renderMessage(item)}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>
      <ConfirmDialog
        isOpen={confirmClear}
        title={t('log.confirmClearTitle')}
        message={t('log.confirmClear')}
        confirmLabel={t('log.clear')}
        variant="danger"
        isLoading={clearing}
        onConfirm={handleClear}
        onCancel={() => {
          if (!clearing) setConfirmClear(false);
        }}
      />
    </aside>
  );
};
