import { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../i18n';
import type { Locale } from '../i18n';
import { Video, LogOut, User as UserIcon, Shield, KeyRound, Camera, Menu, X, Activity, ChevronLeft, ChevronRight, ChevronsUpDown, Globe, Users, Bell } from 'lucide-react';
import ChangePasswordModal from '../components/ChangePasswordModal';
import { AppSettingsModal } from '../components/settings/AppSettingsModal';
import { AppLockScreen } from '../components/lock/AppLockScreen';
import { AppFooter } from '../components/AppFooter';
import { NotificationToast } from '../components/notifications/NotificationToast';
import { NotificationDrawer } from '../components/notifications/NotificationDrawer';
import { useSocket } from '../context/SocketContext';
import axiosClient from '../api/axiosClient';
import { clearPwaRefreshToken } from '../utils/pwa';

const MainLayout = () => {
  const { user, checkAuth } = useAuth();
  const { socket } = useSocket();
  const { t, locale, setLocale } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showNotificationDrawer, setShowNotificationDrawer] = useState(false);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Fetch initial unread count
  useEffect(() => {
    axiosClient.get('/notifications')
      .then((res) => {
        setUnreadNotifCount(res.data?.unread_count || 0);
      })
      .catch(() => {});
  }, []);

  // Listen for new notifications via socket
  useEffect(() => {
    if (!socket) return;
    const handleNewNotif = () => {
      setUnreadNotifCount((prev) => prev + 1);
    };
    socket.on('notification.new', handleNewNotif);
    return () => {
      socket.off('notification.new', handleNewNotif);
    };
  }, [socket]);

  useEffect(() => {
    if (location.pathname === '/playback') {
      setIsSidebarCollapsed(true);
    }
  }, [location.pathname]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    if (isUserMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isUserMenuOpen]);

  const handleLogout = async () => {
    clearPwaRefreshToken();
    await axiosClient.post('/auth/logout');
    await checkAuth();
    navigate('/login');
  };

  const handleSwitchLocale = async () => {
    const newLocale: Locale = locale === 'vi' ? 'en' : 'vi';
    setLocale(newLocale);
    try {
      await axiosClient.put('/auth/locale', { locale: newLocale });
    } catch (err) {
      console.error('Failed to save locale preference', err);
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-[100dvh] w-screen overflow-hidden bg-slate-50 pl-safe pr-safe">
      {/* App Lock Screen Overlay */}
      <AppLockScreen />

      {/* Floating Realtime Notification Toast */}
      <NotificationToast />

      {/* Notification Drawer */}
      <NotificationDrawer
        isOpen={showNotificationDrawer}
        onClose={() => setShowNotificationDrawer(false)}
        onUnreadCountChange={setUnreadNotifCount}
      />

      {/* Mobile Header (In flex-flow on mobile: shrink-0, hidden on desktop) */}
      <header className="md:hidden shrink-0 w-full bg-white/95 backdrop-blur-md border-b border-slate-200/90 z-30 pt-safe shadow-xs">
        <div className="h-14 flex items-center justify-between px-4">
          <NavLink to="/" className="flex items-center gap-2.5 no-underline group cursor-pointer">
            <div className="w-8 h-8 rounded-xl bg-orange-600 flex items-center justify-center text-white shadow-xs group-active:scale-95 transition-transform">
              <Camera size={18} />
            </div>
            <h2 className="text-base font-bold m-0 text-slate-800 tracking-tight">HubSight</h2>
          </NavLink>

          <div className="flex items-center gap-1">
            {/* Notification Bell on Mobile */}
            <button
              className="p-2 rounded-xl text-slate-600 hover:text-slate-900 active:bg-slate-100 transition-colors touch-manipulation relative cursor-pointer"
              onClick={() => setShowNotificationDrawer(true)}
              aria-label="Notifications"
            >
              <Bell size={20} />
              {unreadNotifCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white animate-pulse" />
              )}
            </button>

            <button
              className="p-2 rounded-xl text-slate-600 hover:text-slate-900 active:bg-slate-100 transition-colors touch-manipulation cursor-pointer"
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="Open navigation menu"
            >
              <Menu size={22} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Backdrop */}
      {isMobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 bg-white shadow-xl shadow-slate-200/20 border-r border-slate-200 flex flex-col pt-safe pb-safe overflow-hidden
        transition-all duration-300 ease-in-out md:relative md:py-6
        ${isMobileMenuOpen ? 'translate-x-0 w-[270px]' : '-translate-x-full w-[270px] md:translate-x-0'}
        ${isSidebarCollapsed ? 'md:w-0 md:min-w-0 md:opacity-0 md:border-none' : 'md:w-[260px] md:min-w-[260px] md:opacity-100'}
      `}>
        <div className="flex items-center justify-between px-6 pt-3 pb-2 md:pt-0 mb-6 md:mb-8">
          <NavLink to="/" className="flex items-center gap-3 no-underline group cursor-pointer">
            <div className="w-10 h-10 rounded-xl bg-orange-600 flex items-center justify-center text-white shadow-xs group-hover:scale-105 transition-transform">
              <Camera size={22} />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-none text-slate-800 group-hover:text-orange-600 transition-colors">HubSight</h1>
              <span className="text-[11px] text-slate-600 font-medium tracking-wide">{t('nav.subtitle')}</span>
            </div>
          </NavLink>
          <button 
            className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 flex flex-col">
          {user?.role === 'admin' && (
            <NavLink to="/devices" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <Camera size={20} />
              {t('nav.devices')}
            </NavLink>
          )}
          {user?.role === 'admin' && (
            <NavLink to="/members" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <Users size={20} />
              {t('nav.members')}
            </NavLink>
          )}
          <NavLink to="/playback" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Video size={20} />
            {t('nav.playback')}
          </NavLink>
          {user?.role === 'admin' && (
            <NavLink to="/recorder" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <Activity size={20} />
              {t('nav.nvrMonitor')}
            </NavLink>
          )}

          {/* Notifications Button */}
          <button
            onClick={() => {
              setIsMobileMenuOpen(false);
              setShowNotificationDrawer(true);
            }}
            className="nav-link w-full text-left cursor-pointer relative"
          >
            <Bell size={20} />
            <span className="flex-1">{t('notifications.title')}</span>
            {unreadNotifCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-500 text-white leading-none">
                {unreadNotifCount}
              </span>
            )}
          </button>
        </nav>

        {/* Language Switch */}
        <div className="px-3 mb-2">
          <button
            onClick={handleSwitchLocale}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer border border-transparent hover:border-slate-200"
          >
            <Globe size={15} className="text-slate-400 shrink-0" />
            <span className="flex-1 text-left">{t('lang.switch')}</span>
            <span className="text-[11px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-md border border-orange-200">
              {locale === 'vi' ? '🇻🇳 VI' : '🇬🇧 EN'}
            </span>
          </button>
        </div>

        {/* Compact Bottom User Profile & Actions Popover */}
        <div className="mt-auto border-t border-slate-200 pt-3 px-3 relative" ref={userMenuRef}>
          {/* User Popover Menu */}
          {isUserMenuOpen && (
            <div className="absolute bottom-full left-3 right-3 mb-2 bg-white border border-slate-200 rounded-2xl shadow-xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-3 py-2 border-b border-slate-100 mb-1">
                <p className="text-xs font-bold text-slate-800 truncate">
                  {user?.full_name || user?.username}
                </p>
                <p className="text-[11px] text-slate-400 font-mono truncate">
                  @{user?.username} • {user?.role === 'admin' ? t('admin') : t('viewer')}
                </p>
              </div>

              <button
                onClick={() => {
                  setShowSettingsModal(true);
                  setIsUserMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
              >
                <Shield size={15} className="text-orange-600 shrink-0" />
                {t('nav.security')}
              </button>

              <button
                onClick={() => {
                  setShowPasswordModal(true);
                  setIsUserMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
              >
                <KeyRound size={15} className="text-slate-500 shrink-0" />
                {t('nav.changePassword')}
              </button>

              <div className="my-1 border-t border-slate-100" />

              <button
                onClick={() => {
                  setIsUserMenuOpen(false);
                  handleLogout();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
              >
                <LogOut size={15} className="shrink-0" />
                {t('nav.logout')}
              </button>
            </div>
          )}

          {/* Interactive User Row */}
          <button
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className={`w-full flex items-center gap-2.5 p-2 rounded-xl border transition-all text-left cursor-pointer group ${
              isUserMenuOpen
                ? 'bg-orange-50/50 border-orange-200 shadow-xs'
                : 'bg-white hover:bg-slate-50 border-transparent hover:border-slate-200'
            }`}
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-bold transition-colors ${
                user?.role === 'admin'
                  ? 'bg-red-50 text-red-600 group-hover:bg-red-100'
                  : 'bg-blue-50 text-blue-600 group-hover:bg-blue-100'
              }`}
            >
              <UserIcon size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p
                className="text-xs font-bold text-slate-800 truncate leading-tight"
                title={user?.full_name || user?.username}
              >
                {user?.full_name || user?.username}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider shrink-0 border leading-none ${
                    user?.role === 'admin'
                      ? 'bg-red-50 text-red-600 border-red-200'
                      : 'bg-blue-50 text-blue-600 border-blue-200'
                  }`}
                >
                  {user?.role === 'admin' ? t('admin') : t('viewer')}
                </span>
                <span className="text-[11px] text-slate-400 font-mono truncate">
                  @{user?.username}
                </span>
              </div>
            </div>
            <ChevronsUpDown size={14} className="text-slate-400 group-hover:text-slate-600 shrink-0 transition-colors" />
          </button>

          <AppFooter className="mt-2 pt-2 border-t border-slate-100/80" />
        </div>
      </aside>

      {/* Desktop Sidebar Toggle Button */}
      <button
        onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        className={`hidden md:flex fixed top-1/2 -translate-y-1/2 z-40 bg-white border border-slate-200 shadow-md py-3 px-1 rounded-r-xl transition-all duration-300 hover:bg-slate-50 text-slate-400 hover:text-slate-700 cursor-pointer ${
          isSidebarCollapsed ? 'left-0' : 'left-[260px]'
        }`}
        title={isSidebarCollapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
      >
        {isSidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>

      {/* Main Content Area (Natural flex flow below Mobile Header) */}
      <main className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden relative pb-safe md:pb-0">
        <Outlet />
      </main>

      {showPasswordModal && <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />}
      {showSettingsModal && <AppSettingsModal onClose={() => setShowSettingsModal(false)} />}
    </div>
  );
};

export default MainLayout;
