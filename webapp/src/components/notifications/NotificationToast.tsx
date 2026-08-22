import React, { useEffect, useState } from 'react';
import { X, ShieldCheck, HeartHandshake, AlertTriangle, Bell, ArrowRight } from 'lucide-react';
import type { NotificationItem } from '../../types/notification';
import { useSocket } from '../../context/SocketContext';
import { useNavigate } from 'react-router-dom';

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

    if (category === 'stranger') {
      // Urgent double beep for stranger
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
  const { socket } = useSocket();
  const navigate = useNavigate();
  const [currentToast, setCurrentToast] = useState<NotificationItem | null>(null);

  useEffect(() => {
    if (!socket) return;

    const handleNewNotif = (notif: NotificationItem) => {
      setCurrentToast(notif);
      playNotificationChime(notif.category);

      // Auto dismiss after 6 seconds
      const timer = setTimeout(() => {
        setCurrentToast((prev) => (prev?.id === notif.id ? null : prev));
      }, 6000);

      return () => clearTimeout(timer);
    };

    socket.on('notification.new', handleNewNotif);
    return () => {
      socket.off('notification.new', handleNewNotif);
    };
  }, [socket]);

  if (!currentToast) return null;

  const isFamily = currentToast.category === 'family';
  const isGuest = currentToast.category === 'guest';
  const isStranger = currentToast.category === 'stranger';

  const handleClick = () => {
    if (currentToast.camera_id) {
      navigate(`/playback`);
    }
    setCurrentToast(null);
  };

  return (
    <div className="fixed top-4 right-4 z-50 max-w-sm w-full animate-in fade-in slide-in-from-top-4 duration-300 pointer-events-auto">
      <div
        onClick={handleClick}
        className={`p-4 rounded-2xl shadow-2xl border backdrop-blur-md cursor-pointer transition-all duration-200 group relative overflow-hidden ${
          isFamily
            ? 'bg-slate-900/95 text-white border-emerald-500/50 shadow-emerald-950/40'
            : isGuest
            ? 'bg-slate-900/95 text-white border-blue-500/50 shadow-blue-950/40'
            : isStranger
            ? 'bg-red-950/95 text-white border-red-500 shadow-red-950/60 animate-pulse'
            : 'bg-slate-900/95 text-white border-slate-700 shadow-slate-950/40'
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
              {currentToast.title}
            </h4>
            <p className="text-[11px] text-slate-300 mt-1 line-clamp-2 leading-relaxed">
              {currentToast.body}
            </p>
            <div className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-orange-400 group-hover:text-orange-300 transition-colors">
              <span>Xem trực tiếp camera</span>
              <ArrowRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>

          {/* Dismiss button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setCurrentToast(null);
            }}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Đóng"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
