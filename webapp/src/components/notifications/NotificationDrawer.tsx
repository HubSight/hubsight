import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Bell,
  CheckCheck,
  Trash2,
  ShieldCheck,
  HeartHandshake,
  AlertTriangle,
  Smartphone,
  Check,
  Video
} from 'lucide-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import type { NotificationItem } from '../../types/notification';
import { useTranslation } from '../../i18n';
import axiosClient from '../../api/axiosClient';
import { subscribeToWebPush, isPushNotificationSupported, getPushNotificationPermission } from '../../utils/push';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../../context/SocketContext';

dayjs.extend(relativeTime);

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onUnreadCountChange?: (count: number) => void;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
  isOpen,
  onClose,
  onUnreadCountChange,
}) => {
  const { t } = useTranslation();
  const { socket } = useSocket();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [pushStatus, setPushStatus] = useState<NotificationPermission>('default');
  const [isSubscribingPush, setIsSubscribingPush] = useState(false);

  useEffect(() => {
    setPushStatus(getPushNotificationPermission());
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await axiosClient.get('/notifications');
      const data = res.data;
      setNotifications(data?.notifications || []);
      const count = data?.unread_count || 0;
      setUnreadCount(count);
      onUnreadCountChange?.(count);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setIsLoading(false);
    }
  }, [onUnreadCountChange]);

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen, fetchNotifications]);

  // Real-time dynamic append when socket receives new notification
  useEffect(() => {
    if (!socket) return;
    const handleNewNotif = (notif: NotificationItem) => {
      setNotifications((prev) => [notif, ...prev.filter((n) => n.id !== notif.id)]);
      setUnreadCount((prev) => prev + 1);
    };
    socket.on('notification.new', handleNewNotif);
    return () => {
      socket.off('notification.new', handleNewNotif);
    };
  }, [socket]);

  const handleMarkAllRead = async () => {
    try {
      await axiosClient.post('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
      onUnreadCountChange?.(0);
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  };

  const handleMarkRead = async (id: string) => {
    try {
      await axiosClient.patch(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      const nextUnread = Math.max(0, unreadCount - 1);
      setUnreadCount(nextUnread);
      onUnreadCountChange?.(nextUnread);
    } catch (err) {
      console.error('Failed to mark read:', err);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await axiosClient.delete(`/notifications/${id}`);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  const handleEnablePush = async () => {
    setIsSubscribingPush(true);
    const success = await subscribeToWebPush();
    setIsSubscribingPush(false);
    if (success) {
      setPushStatus('granted');
    }
  };

  const handleItemClick = (n: NotificationItem) => {
    if (!n.is_read) {
      handleMarkRead(n.id);
    }
    if (n.camera_id) {
      onClose();
      navigate('/playback');
    }
  };

  if (!isOpen) return null;

  const filteredNotifications = notifications.filter((n) =>
    filter === 'unread' ? !n.is_read : true
  );

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity animate-in fade-in"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white shadow-2xl border-l border-slate-200/90 flex flex-col animate-in slide-in-from-right duration-300">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center font-bold">
                <Bell size={18} />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
                  {t('notifications.title')}
                  {unreadCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-500 text-white leading-none">
                      {unreadCount}
                    </span>
                  )}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {t('notifications.subtitle')}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>

          {/* Web Push Banner (If not yet enabled) */}
          {isPushNotificationSupported() && pushStatus !== 'granted' && (
            <div className="m-3 p-3.5 rounded-2xl bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200/80 flex items-start gap-3 shadow-xs">
              <div className="w-8 h-8 rounded-xl bg-orange-600 text-white flex items-center justify-center shrink-0">
                <Smartphone size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-xs text-slate-800">
                  {t('notifications.enablePushTitle')}
                </h4>
                <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                  {t('notifications.enablePushDesc')}
                </p>
                <button
                  onClick={handleEnablePush}
                  disabled={isSubscribingPush}
                  className="mt-2.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-orange-600 hover:bg-orange-700 active:scale-95 text-white transition-all cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {isSubscribingPush ? t('loading') : t('notifications.enablePushBtn')}
                </button>
              </div>
            </div>
          )}

          {/* Toolbar: Filter + Mark all read */}
          <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl text-xs font-semibold">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  filter === 'all'
                    ? 'bg-white text-slate-800 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {t('common.all')} ({notifications.length})
              </button>
              <button
                onClick={() => setFilter('unread')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  filter === 'unread'
                    ? 'bg-white text-slate-800 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {t('notifications.unread')} ({unreadCount})
              </button>
            </div>

            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700 font-semibold cursor-pointer"
              >
                <CheckCheck size={14} />
                {t('notifications.markAllRead')}
              </button>
            )}
          </div>

          {/* Notification List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {isLoading && notifications.length === 0 ? (
              <div className="space-y-3 p-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-20 bg-slate-100 rounded-2xl animate-pulse" />
                ))}
              </div>
            ) : filteredNotifications.length > 0 ? (
              filteredNotifications.map((n) => {
                const isFamily = n.category === 'family';
                const isGuest = n.category === 'guest';
                const isStranger = n.category === 'stranger';

                return (
                  <div
                    key={n.id}
                    onClick={() => handleItemClick(n)}
                    className={`p-3.5 rounded-2xl border transition-all duration-150 cursor-pointer flex items-start gap-3 relative group overflow-hidden ${
                      !n.is_read
                        ? isFamily
                          ? 'bg-emerald-50/40 border-emerald-200 hover:bg-emerald-50/70'
                          : isGuest
                          ? 'bg-blue-50/40 border-blue-200 hover:bg-blue-50/70'
                          : isStranger
                          ? 'bg-red-50/50 border-red-200 hover:bg-red-50/80'
                          : 'bg-orange-50/40 border-orange-200'
                        : 'bg-white hover:bg-slate-50 border-slate-200/80'
                    }`}
                  >
                    {/* Unread indicator bar */}
                    {!n.is_read && (
                      <div
                        className={`absolute top-0 bottom-0 left-0 w-1 ${
                          isFamily
                            ? 'bg-emerald-500'
                            : isGuest
                            ? 'bg-blue-500'
                            : isStranger
                            ? 'bg-red-500'
                            : 'bg-orange-500'
                        }`}
                      />
                    )}

                    {/* Category Icon */}
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                        isFamily
                          ? 'bg-emerald-100 text-emerald-700'
                          : isGuest
                          ? 'bg-blue-100 text-blue-700'
                          : isStranger
                          ? 'bg-red-100 text-red-700'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {isFamily ? (
                        <ShieldCheck size={18} />
                      ) : isGuest ? (
                        <HeartHandshake size={18} />
                      ) : isStranger ? (
                        <AlertTriangle size={18} />
                      ) : (
                        <Bell size={18} />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pr-6">
                      <div className="flex items-center justify-between gap-1">
                        <h4
                          className={`text-xs font-bold truncate ${
                            !n.is_read ? 'text-slate-900' : 'text-slate-700'
                          }`}
                        >
                          {n.title}
                        </h4>
                        <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                          {dayjs(n.created_at).fromNow()}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-600 mt-1 line-clamp-2 leading-relaxed">
                        {n.body}
                      </p>

                      {n.camera_id && (
                        <div className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-orange-600">
                          <Video size={12} />
                          <span>Xem lại camera</span>
                        </div>
                      )}
                    </div>

                    {/* Delete button */}
                    <button
                      onClick={(e) => handleDelete(e, n.id)}
                      className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                      title={t('common.delete')}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                <Check size={32} className="text-emerald-500 opacity-60" />
                <p className="text-xs font-medium">{t('notifications.noNotifications')}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
