import { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../i18n';
import type { Locale } from '../i18n';
import { Video, LogOut, User as UserIcon, Shield, KeyRound, Camera, Menu, X, Activity, ChevronLeft, ChevronRight, ChevronsUpDown, Globe, Users, Bell, Layers, LayoutGrid, UserCog } from 'lucide-react';
import ChangePasswordModal from '../components/ChangePasswordModal';
import { AppSettingsModal } from '../components/settings/AppSettingsModal';
import { AppFooter } from '../components/AppFooter';
import { NotificationToast } from '../components/notifications/NotificationToast';
import { NotificationDrawer } from '../components/notifications/NotificationDrawer';
import { useOnNotification } from '@hubsight/sdk/react';
import { api } from '../api/client';
import { getPushNotificationPermission, subscribeToWebPush } from '../utils/push';
import { Toaster } from 'react-hot-toast';

const MainLayout = () => {
  const { user, checkAuth } = useAuth();
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
    api.notifications
      .list()
      .then((res) => setUnreadNotifCount(res.unread_count))
      .catch(() => { });
  }, []);

  // Refresh FCM / Web Push token silently when permission is already granted.
  useEffect(() => {
    if (!user) return;
    if (getPushNotificationPermission() !== 'granted') return;
    void subscribeToWebPush({ requestPermission: false });
  }, [user]);

  // Bump the bell badge when the relay pushes a new notification
  useOnNotification(() => {
    setUnreadNotifCount((prev) => prev + 1);
  });

  useEffect(() => {
    if (location.pathname === '/playback' || location.pathname === '/multiview') {
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
    await api.auth.logout();
    await checkAuth();
    navigate('/login');
  };

  const handleSwitchLocale = async () => {
    const newLocale: Locale = locale === 'vi' ? 'en' : 'vi';
    setLocale(newLocale);
    try {
      await api.auth.setLocale(newLocale);
    } catch (err) {
      console.error('Failed to save locale preference', err);
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-[100dvh] w-screen overflow-hidden bg-slate-50 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      {/* Floating Realtime Notification Toast */}
      <NotificationToast />
      <Toaster position="top-right" />

      {/* Notification Drawer */}
      <NotificationDrawer
        isOpen={showNotificationDrawer}
        onClose={() => setShowNotificationDrawer(false)}
        onUnreadCountChange={setUnreadNotifCount}
      />

      {/* Mobile Header (In flex-flow on mobile: shrink-0, hidden on desktop) */}
      <header className="md:hidden shrink-0 w-full bg-white/95 backdrop-blur-md border-b border-slate-200/90 z-30 pt-[env(safe-area-inset-top)] shadow-xs">
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
        fixed inset-y-0 left-0 z-50 bg-white shadow-xl shadow-slate-200/20 border-r border-slate-200 flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] overflow-hidden
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

        <nav className="flex-1 flex flex-col overflow-y-auto custom-scrollbar">
          {/* Section 1: Giám sát (Surveillance) */}
          <div className="px-6 pt-1 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 select-none">
            {t('nav.sectionSurveillance')}
          </div>
          <NavLink to="/multiview" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <LayoutGrid size={20} />
            {t('nav.multiview')}
          </NavLink>
          <NavLink to="/playback" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Video size={20} />
            {t('nav.playback')}
          </NavLink>

          {/* Section 2: Quản lý (Management) */}
          {user?.role === 'admin' && (
            <>
              <div className="px-6 pt-4 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 select-none">
                {t('nav.sectionManagement')}
              </div>
              <NavLink to="/devices" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <Camera size={20} />
                {t('nav.devices')}
              </NavLink>
              <NavLink to="/members" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <Users size={20} />
                {t('nav.members')}
              </NavLink>
            </>
          )}

          {/* Section 3: Hệ thống (System) */}
          {user?.role === 'admin' && (
            <>
              <div className="px-6 pt-4 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 select-none">
                {t('nav.sectionSystem')}
              </div>
              <NavLink to="/recorder" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <Activity size={20} />
                {t('nav.nvrMonitor')}
              </NavLink>
              <NavLink to="/pool" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <Layers size={20} />
                {t('nav.poolMonitor')}
              </NavLink>
            </>
          )}

          {/* Section 4: Quản trị (Administration) */}
          {(user?.role === 'admin' || user?.permissions?.includes('users:view') || user?.permissions?.includes('users:manage') || user?.permissions?.includes('roles:manage') || user?.permissions?.includes('clients:manage') || user?.permissions?.includes('*')) && (
            <>
              <div className="px-6 pt-4 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 select-none">
                {t('nav.sectionAdmin')}
              </div>
              {(user?.role === 'admin' || user?.permissions?.includes('users:view') || user?.permissions?.includes('users:manage') || user?.permissions?.includes('*')) && (
                <NavLink to="/users" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  <UserCog size={20} />
                  {t('nav.users')}
                </NavLink>
              )}
              {(user?.role === 'admin' || user?.permissions?.includes('roles:manage') || user?.permissions?.includes('*')) && (
                <NavLink to="/roles" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  <Shield size={20} />
                  {t('nav.roles')}
                </NavLink>
              )}
              {(user?.role === 'admin' || user?.permissions?.includes('clients:manage') || user?.permissions?.includes('*')) && (
                <NavLink to="/clients" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  <KeyRound size={20} />
                  {t('nav.clients')}
                </NavLink>
              )}
            </>
          )}
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

          {/* Interactive User Row with Bell Button next to Profile */}
          <div className="flex items-center gap-1.5">
            {/* Profile Button */}
            <button
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className={`flex-1 min-w-0 flex items-center gap-2.5 p-2 rounded-xl border transition-all text-left cursor-pointer group ${isUserMenuOpen
                ? 'bg-orange-50/50 border-orange-200 shadow-xs'
                : 'bg-white hover:bg-slate-50 border-transparent hover:border-slate-200'
                }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-bold transition-colors ${user?.role === 'admin'
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
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider shrink-0 border leading-none ${user?.role === 'admin'
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

            {/* Notification Bell Button */}
            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                setShowNotificationDrawer(true);
              }}
              className="relative p-2.5 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-600 hover:text-slate-900 active:scale-95 transition-all cursor-pointer shrink-0 flex items-center justify-center bg-white shadow-2xs"
              title={t('notifications.title')}
              aria-label={t('notifications.title')}
            >
              <Bell size={18} />
              {unreadNotifCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-red-500 text-white flex items-center justify-center ring-2 ring-white leading-none animate-pulse">
                  {unreadNotifCount > 99 ? '99+' : unreadNotifCount}
                </span>
              )}
            </button>
          </div>

          <AppFooter className="mt-2 pt-2 border-t border-slate-100/80" />
        </div>
      </aside>

      {/* Desktop Sidebar Toggle Button */}
      <button
        onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        className={`hidden md:flex fixed top-1/2 -translate-y-1/2 z-40 bg-white border border-slate-200 shadow-md py-3 px-1 rounded-r-xl transition-all duration-300 hover:bg-slate-50 text-slate-400 hover:text-slate-700 cursor-pointer ${isSidebarCollapsed ? 'left-0' : 'left-[260px]'
          }`}
        title={isSidebarCollapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
      >
        {isSidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>

      {/* Main Content Area (Natural flex flow below Mobile Header) */}
      <main className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden relative pb-[env(safe-area-inset-bottom)] md:pb-0">
        <Outlet />
      </main>

      {showPasswordModal && <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />}
      {showSettingsModal && <AppSettingsModal onClose={() => setShowSettingsModal(false)} />}
    </div>
  );
};

export default MainLayout;
