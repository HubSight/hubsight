import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Radar, X, CheckCircle2, Loader2, Camera } from 'lucide-react';
import { api } from '../../api/client';
import type { ScanCandidate, ScanJob } from '@hubsight/sdk';
import { useTranslation } from '../../i18n';

// Re-exported for call sites that import the candidate shape from this module.
export type { ScanCandidate } from '@hubsight/sdk';

interface DeviceScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void;
  onConfigure: (c: ScanCandidate) => void;
}

export const DeviceScanModal: React.FC<DeviceScanModalProps> = ({
  isOpen,
  onClose,
  onImported,
  onConfigure,
}) => {
  const { t } = useTranslation();
  const [extraCidr, setExtraCidr] = useState('');
  const [job, setJob] = useState<ScanJob | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const pollRef = useRef<number | null>(null);

  const stopPoll = () => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startScan = async () => {
    setError('');
    setJob(null);
    setSelected(new Set());
    try {
      const extra = extraCidr
        .split(/[,;\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      setJob(await api.devices.startScan(extra));
    } catch (err: any) {
      setError(err?.response?.data?.error || t('devices.scanFailed'));
    }
  };

  useEffect(() => {
    if (!isOpen) {
      stopPoll();
      return;
    }
    startScan();
    return stopPoll;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    stopPoll();
    if (!isOpen || !job?.id || job.status !== 'running') return;
    pollRef.current = window.setInterval(async () => {
      try {
        setJob(await api.devices.getScan(job.id));
      } catch {
        /* ignore transient */
      }
    }, 1000);
    return stopPoll;
  }, [isOpen, job?.id, job?.status]);

  if (!isOpen) return null;

  const candidates = job?.candidates || [];
  const running = job?.status === 'running';
  const pct = job && job.total > 0 ? Math.min(100, Math.round((job.scanned / job.total) * 100)) : 0;

  const toggle = (ip: string) => {
    const next = new Set(selected);
    if (next.has(ip)) next.delete(ip);
    else next.add(ip);
    setSelected(next);
  };

  const importSelected = async () => {
    const picked = candidates.filter((c) => selected.has(c.ip));
    if (picked.length === 0) return;
    setImporting(true);
    setError('');
    try {
      for (const c of picked) {
        await api.cameras.create({
          name: `Camera ${c.ip}`,
          host: c.rtsp_url,
          brand: c.brand || 'generic',
          rtsp_port: c.port || 554,
          rtsp_transport: 'tcp',
          is_active: true,
          enable_ai: false,
        });
      }
      onImported();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error || t('devices.scanImportFailed'));
    } finally {
      setImporting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-2xl max-h-[92dvh] rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200/90 flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
              <Radar size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">{t('devices.scanTitle')}</h2>
              <p className="text-[11px] text-slate-500">{t('devices.scanSubtitle')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-slate-100 flex flex-col sm:flex-row gap-2">
          <input
            value={extraCidr}
            onChange={(e) => setExtraCidr(e.target.value)}
            placeholder={t('devices.scanCidrPlaceholder')}
            disabled={running}
            className="flex-1 px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-orange-500"
          />
          <button
            type="button"
            onClick={startScan}
            disabled={running}
            className="px-4 py-2 text-sm font-semibold rounded-xl bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 cursor-pointer"
          >
            {running ? t('devices.scanRunning') : t('devices.scanAgain')}
          </button>
        </div>

        {running && (
          <div className="px-5 pt-3">
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-orange-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">
              {t('devices.scanProgress', {
                scanned: job?.scanned ?? 0,
                total: job?.total ?? 0,
                iface: job?.iface || '—',
              })}
            </p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs">{error}</div>
          )}
          {candidates.length === 0 && !running && (
            <div className="text-center py-10 text-sm text-slate-500">{t('devices.scanEmpty')}</div>
          )}
          {candidates.map((c) => {
            const on = selected.has(c.ip);
            return (
              <label
                key={c.ip}
                className={`flex items-start gap-3 p-3 rounded-2xl border cursor-pointer transition-colors ${on ? 'border-orange-400 bg-orange-50/40' : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
              >
                <input type="checkbox" className="mt-1" checked={on} onChange={() => toggle(c.ip)} />
                <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                  <Camera size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-slate-800">{c.ip}:{c.port}</span>
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600">
                      {c.brand || 'generic'}
                    </span>
                    {c.via && <span className="text-[10px] text-slate-400">via {c.via}</span>}
                  </div>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5 font-mono">{c.rtsp_url}</p>
                  <button
                    type="button"
                    className="text-[11px] font-semibold text-orange-600 mt-1 cursor-pointer"
                    onClick={(e) => {
                      e.preventDefault();
                      onConfigure(c);
                    }}
                  >
                    {t('devices.scanConfigure')}
                  </button>
                </div>
                {on && <CheckCircle2 size={16} className="text-orange-500 mt-1" />}
              </label>
            );
          })}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between gap-2 bg-slate-50/80">
          <span className="text-xs text-slate-500">
            {running && <Loader2 size={12} className="inline animate-spin mr-1" />}
            {t('devices.scanFound', { count: candidates.length })}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold rounded-xl bg-white border border-slate-200 text-slate-600 cursor-pointer"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              disabled={selected.size === 0 || importing}
              onClick={importSelected}
              className="px-4 py-2 text-sm font-semibold rounded-xl bg-orange-600 text-white disabled:opacity-50 cursor-pointer"
            >
              {importing ? t('devices.saving') : t('devices.scanAddSelected', { count: selected.size })}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
