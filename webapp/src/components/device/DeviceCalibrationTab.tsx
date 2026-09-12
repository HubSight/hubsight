import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveStream } from '@hubsight/sdk/react';
import { AlertCircle, CheckCircle2, Crosshair, Loader2 } from '@/components/icons';
import { api } from '../../api/client';
import { useTranslation } from '../../i18n';
import { ProBlackScreen } from '../common/ProBlackScreen';

export interface DeviceCalibrationTabProps {
  cameraId: string;
  isFixed: boolean;
  onChangeIsFixed: (isFixed: boolean) => void;
  hasExistingCalibration: boolean;
  homographyValid?: boolean;
  homographyUpdatedAt?: string;
  onSaved?: () => void;
}

type Point = { x: number; y: number };

const MAX_POINTS = 4;

// §2.4 — opt-in ground-plane homography calibration: an admin clicks 4 floor
// points on the live feed (a rectangle in the real room), which vision-service
// maps onto a unit floor square for bird's-eye-view tracking on fixed cameras.
export const DeviceCalibrationTab: React.FC<DeviceCalibrationTabProps> = ({
  cameraId,
  isFixed,
  onChangeIsFixed,
  hasExistingCalibration,
  homographyValid,
  homographyUpdatedAt,
  onSaved,
}) => {
  const { t } = useTranslation();
  const { videoRef, status } = useLiveStream(isFixed ? cameraId : null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);

  const videoBox = useCallback(() => {
    const video = videoRef.current;
    const wrap = wrapRef.current;
    if (!video || !wrap) return null;
    const cssW = wrap.clientWidth;
    const cssH = wrap.clientHeight;
    const vidW = video.videoWidth || 0;
    const vidH = video.videoHeight || 0;
    let ox = 0, oy = 0, dw = cssW, dh = cssH;
    if (vidW > 0 && vidH > 0) {
      const scale = Math.min(cssW / vidW, cssH / vidH);
      dw = vidW * scale;
      dh = vidH * scale;
      ox = (cssW - dw) / 2;
      oy = (cssH - dh) / 2;
    }
    return { cssW, cssH, ox, oy, dw, dh };
  }, [videoRef]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const box = videoBox();
    if (!canvas || !box) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.max(1, Math.round(box.cssW * dpr));
    const targetH = Math.max(1, Math.round(box.cssH * dpr));
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
      canvas.style.width = `${box.cssW}px`;
      canvas.style.height = `${box.cssH}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, box.cssW, box.cssH);

    const toCanvas = (p: Point) => [box.ox + p.x * box.dw, box.oy + p.y * box.dh];

    if (points.length >= 2) {
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 2;
      ctx.beginPath();
      points.forEach((p, i) => {
        const [x, y] = toCanvas(p);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      if (points.length === MAX_POINTS) ctx.closePath();
      ctx.stroke();
    }
    points.forEach((p, i) => {
      const [x, y] = toCanvas(p);
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), x, y);
    });
  }, [points, videoBox]);

  useEffect(() => {
    draw();
    const ro = new ResizeObserver(() => draw());
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [draw]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const box = videoBox();
    if (!box) return;
    const rect = wrapRef.current!.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    if (clickX < box.ox || clickX > box.ox + box.dw || clickY < box.oy || clickY > box.oy + box.dh) {
      return; // outside the actual video content (letterbox bars)
    }
    const xNorm = Math.min(1, Math.max(0, (clickX - box.ox) / box.dw));
    const yNorm = Math.min(1, Math.max(0, (clickY - box.oy) / box.dh));
    setSaved(false);
    setPoints((prev) => (prev.length >= MAX_POINTS ? prev : [...prev, { x: xNorm, y: yNorm }]));
  };

  const handleSave = async () => {
    if (points.length !== MAX_POINTS) return;
    setIsSaving(true);
    setSaveError('');
    try {
      await api.cameras.updateHomography(cameraId, points);
      setSaved(true);
      onSaved?.();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-start gap-3 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 cursor-pointer">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded accent-orange-500 cursor-pointer"
          checked={isFixed}
          onChange={(e) => onChangeIsFixed(e.target.checked)}
        />
        <span>
          <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
            {t('device.calibrationIsFixed')}
          </span>
          <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('device.calibrationIsFixedDesc')}
          </span>
        </span>
      </label>

      {isFixed && (
        <>
          {hasExistingCalibration && homographyValid === false && (
            <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-700 dark:text-amber-400 text-xs font-medium">
              <AlertCircle size={14} className="shrink-0" />
              {t('device.calibrationInvalidated')}
            </div>
          )}
          {hasExistingCalibration && homographyValid !== false && (
            <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-400 text-xs font-medium">
              <CheckCircle2 size={14} className="shrink-0" />
              {homographyUpdatedAt
                ? t('device.calibrationCalibratedAt', { date: new Date(homographyUpdatedAt).toLocaleString() })
                : t('device.calibrationCalibrated')}
            </div>
          )}

          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('device.calibrationInstructions')}
          </p>

          <div
            ref={wrapRef}
            onClick={handleClick}
            className="relative w-full aspect-video bg-slate-950 rounded-2xl overflow-hidden cursor-crosshair select-none"
          >
            <video ref={videoRef} className={`w-full h-full object-contain ${status === 'live' ? '' : 'hidden'}`} muted playsInline autoPlay />
            <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />
            {status !== 'live' && (
              <div className="absolute inset-0 z-10">
                {status === 'connecting' ? (
                  <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs gap-2 bg-slate-950/80 backdrop-blur-xs">
                    <Loader2 size={16} className="animate-spin text-orange-500" />
                    {t('device.calibrationWaitingForStream')}
                  </div>
                ) : (
                  <ProBlackScreen
                    title={t('device.calibrationWaitingForStream')}
                    subtitle={cameraId}
                  />
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {t('device.calibrationPointsCount', { count: points.length, max: MAX_POINTS })}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn btn-secondary px-3 py-1.5 text-xs font-semibold cursor-pointer"
                onClick={() => { setPoints([]); setSaved(false); }}
                disabled={points.length === 0}
              >
                {t('device.calibrationReset')}
              </button>
              <button
                type="button"
                className="btn btn-secondary px-3 py-1.5 text-xs font-semibold cursor-pointer"
                onClick={() => setPoints((prev) => prev.slice(0, -1))}
                disabled={points.length === 0}
              >
                {t('device.calibrationUndo')}
              </button>
              <button
                type="button"
                className="btn btn-primary px-4 py-1.5 text-xs font-semibold cursor-pointer flex items-center gap-1.5"
                onClick={handleSave}
                disabled={points.length !== MAX_POINTS || isSaving}
              >
                <Crosshair size={13} />
                {isSaving ? t('device.calibrationSaving') : t('device.calibrationSave')}
              </button>
            </div>
          </div>

          {saveError && (
            <div className="text-xs text-red-600 dark:text-red-400 font-medium">{saveError}</div>
          )}
          {saved && !saveError && (
            <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1.5">
              <CheckCircle2 size={13} /> {t('device.calibrationSaved')}
            </div>
          )}
        </>
      )}
    </div>
  );
};
