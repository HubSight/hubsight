import React from 'react';
import { X, ShieldCheck, HeartHandshake, AlertTriangle, Bell, ArrowRight } from 'lucide-react';
import { useRealtimeEvent } from '@hubsight/realtime/react';
import type { NotificationItem } from '../../types/notification';
import { useTimezone } from '../../context/TimezoneContext';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../../i18n';
import toast from 'react-hot-toast';

// Simple Web Audio API gentle notification chime (0 external dependencies)
const playNotificationChime = (category: string) => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (category === 'stranger' || category === 'risk' || category === 'fall' || category === 'suspicious') {
      // Urgent double beep for alerts
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.35);
    } else {
      // Pleasant subtle marimba chime for family/guests
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880.0, ctx.currentTime + 0.08); // A5
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    }
  } catch (_) {
    // Audio autoplay restrictions silently ignored
  }
};

export const NotificationToast: React.FC = () => {
  const { formatNotificationBody } = useTimezone();
  const { t } = useTranslation();
  const navigate = useNavigate();

  useRealtimeEvent('notification.new', (notif: NotificationItem) => {
    playNotificationChime(notif.category);

      const isFamily = notif.category === 'family';
      const isGuest = notif.category === 'guest';
      const isStranger = notif.category === 'stranger';

      toast.custom(
        (tObj) => (
          <div
            onClick={() => {
              toast.dismiss(tObj.id);
              if (notif.camera_id) {
                let url = `/playback?camera_id=${notif.camera_id}`;
                if (notif.created_at) {
                  const tsMs = new Date(notif.created_at).getTime();
                  if (!isNaN(tsMs)) {
                    url += `&t=${tsMs}`;
                  }
                }
                navigate(url);
              }
            }}
            className={`max-w-sm w-full p-4 rounded-2xl shadow-xl border backdrop-blur-md cursor-pointer transition-all duration-200 group relative overflow-hidden pointer-events-auto ${
              tObj.visible ? 'animate-in fade-in zoom-in-95' : 'animate-out fade-out zoom-out-95'
            } ${
              isFamily
                ? 'bg-slate-900/95 text-white border-emerald-500/50'
                : isGuest
                ? 'bg-slate-900/95 text-white border-blue-500/50'
                : isStranger
                ? 'bg-red-950/95 text-white border-red-500/80'
                : 'bg-slate-900/95 text-white border-slate-700'
            }`}
          >
            {/* Left accent bar */}
            <div
              className={`absolute top-0 bottom-0 left-0 w-1.5 ${
                isFamily
                  ? 'bg-emerald-500'
                  : isGuest
                  ? 'bg-blue-500'
                  : isStranger
                  ? 'bg-red-500'
                  : 'bg-slate-400'
              }`}
            />

            <div className="flex items-start gap-3 pl-1.5">
              {/* Icon */}
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
                  isFamily
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : isGuest
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : isStranger
                    ? 'bg-red-500/30 text-red-400 border border-red-500/50'
                    : 'bg-slate-700 text-slate-300'
                }`}
              >
                {isFamily ? (
                  <ShieldCheck size={20} />
                ) : isGuest ? (
                  <HeartHandshake size={20} />
                ) : isStranger ? (
                  <AlertTriangle size={20} className="animate-bounce" />
                ) : (
                  <Bell size={18} />
                )}
              </div>

              {/* Text Content */}
              <div className="flex-1 min-w-0 pr-4">
                <h4 className="font-bold text-xs tracking-tight truncate leading-tight">
                  {notif.title}
                </h4>
                <p className="text-[11px] text-slate-300 mt-1 line-clamp-2 leading-relaxed">
                  {formatNotificationBody(notif.body, notif.created_at || Date.now())}
                </p>
                <div className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-orange-400 group-hover:text-orange-300 transition-colors">
                  <span>{t('notifications.watchLive')}</span>
                  <ArrowRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>

              {/* Dismiss button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toast.dismiss(tObj.id);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title={t('close')}
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ),
        { duration: 6000, id: notif.id }
      );
  });

  return null;
};
