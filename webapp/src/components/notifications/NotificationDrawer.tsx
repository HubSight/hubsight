import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { api } from '../../api/client';
import { subscribeToWebPush, isPushNotificationSupported, getPushNotificationPermission } from '../../utils/push';
import { useNavigate } from 'react-router-dom';
import { useOnNotification } from '@hubsight/sdk/react';
import { useTimezone } from '../../context/TimezoneContext';
import { ConfirmDialog } from '../common/ConfirmDialog';

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
  const { formatNotificationBody, formatDateTime } = useTimezone();
  const navigate = useNavigate();
  const drawerRef = useRef<HTMLDivElement>(null);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [pushStatus, setPushStatus] = useState<NotificationPermission>('default');
  const [isSubscribingPush, setIsSubscribingPush] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  // Auto-close when clicking outside drawer or pressing Escape
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    setPushStatus(getPushNotificationPermission());
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await api.notifications.list();
      setNotifications(data.notifications);
      const count = data.unread_count;
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

  // Real-time dynamic append when the relay pushes a new notification
  useOnNotification((notif: NotificationItem) => {
    setNotifications((prev) => [notif, ...prev.filter((n) => n.id !== notif.id)]);
    setUnreadCount((prev) => prev + 1);
  });

  const handleMarkAllRead = async () => {
    try {
      await api.notifications.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
      onUnreadCountChange?.(0);
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  };

  const handleMarkRead = async (id: string) => {
    try {
      await api.notifications.markRead(id);
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
      await api.notifications.remove(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  const handleClearAll = async () => {
    setClearing(true);
    try {
      await api.notifications.clear();
      setNotifications([]);
      setUnreadCount(0);
      onUnreadCountChange?.(0);
      setConfirmClear(false);
    } catch (err) {
      console.error('Failed to clear notifications:', err);
    } finally {
      setClearing(false);
    }
  };

  const handleTestPush = async () => {
    try {
      await api.notifications.sendTest();
    } catch (err) {
      console.error('Failed to trigger test push:', err);
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
      let url = `/playback?camera_id=${n.camera_id}`;
      if (n.created_at) {
        const ts = new Date(n.created_at).getTime();
        if (!isNaN(ts)) {
          url += `&t=${ts}`;
        }
      }
      navigate(url);
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
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity animate-in fade-in cursor-pointer"
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10 pointer-events-none">
        <div
          ref={drawerRef}
          className="w-screen max-w-md bg-white shadow-2xl border-l border-slate-200/90 flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] animate-in slide-in-from-right duration-300 pointer-events-auto"
        >
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
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${filter === 'all'
                  ? 'bg-white text-slate-800 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
                  }`}
              >
                {t('common.all')} ({notifications.length})
              </button>
              <button
                onClick={() => setFilter('unread')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${filter === 'unread'
                  ? 'bg-white text-slate-800 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
                  }`}
              >
                {t('notifications.unread')} ({unreadCount})
              </button>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleTestPush}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-semibold cursor-pointer"
                title="Test Push Notification"
              >
                <Bell size={14} />
                Test Push
              </button>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700 font-semibold cursor-pointer"
                >
                  <CheckCheck size={14} />
                  {t('notifications.markAllRead')}
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={() => setConfirmClear(true)}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-600 font-semibold cursor-pointer"
                >
                  <Trash2 size={14} />
                  {t('notifications.clearAll')}
                </button>
              )}
            </div>
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
                    className={`p-3.5 rounded-2xl border transition-all duration-150 cursor-pointer flex items-start gap-3 relative group overflow-hidden ${!n.is_read
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
                        className={`absolute top-0 bottom-0 left-0 w-1 ${isFamily
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
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${isFamily
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
                          className={`text-xs font-bold truncate ${!n.is_read ? 'text-slate-900' : 'text-slate-700'
                            }`}
                        >
                          {n.title}
                        </h4>
                        <span
                          className="text-[10px] text-slate-400 shrink-0 font-mono"
                          title={formatDateTime(n.created_at)}
                        >
                          {dayjs(n.created_at).fromNow()}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-600 mt-1 line-clamp-2 leading-relaxed">
                        {formatNotificationBody(n.body, n.created_at)}
                      </p>

                      {n.camera_id && (
                        <div className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-orange-600">
                          <Video size={12} />
                          <span>{t('notifications.viewCamera')}</span>
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
      <ConfirmDialog
        isOpen={confirmClear}
        title={t('notifications.confirmClearTitle')}
        message={t('notifications.confirmClear')}
        confirmLabel={t('notifications.clearAll')}
        variant="danger"
        isLoading={clearing}
        onConfirm={handleClearAll}
        onCancel={() => {
          if (!clearing) setConfirmClear(false);
        }}
      />
    </div>
  );
};
