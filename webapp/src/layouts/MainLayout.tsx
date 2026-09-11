import { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../i18n';
import type { Locale } from '../i18n';
import { Video, LogOut, User as UserIcon, Shield, KeyRound, Camera, Menu, X, Activity, ChevronLeft, ChevronRight, ChevronsUpDown, Globe, Users, Bell, Layers, LayoutGrid, UserCog, FileShield, Sun, Moon, Monitor, Sliders, House, Google } from '@/components/icons';
import { AppFooter } from '../components/AppFooter';
import { NotificationToast } from '../components/notifications/NotificationToast';
import { NotificationDrawer } from '../components/notifications/NotificationDrawer';
import { useOnNotification } from '@hubsight/sdk/react';
import { api } from '../api/client';
import { getPushNotificationPermission, subscribeToWebPush } from '../utils/push';
import { Toaster } from 'react-hot-toast';
import { useTheme } from '../context/ThemeContext';

const MainLayout = () => {
  const { user, checkAuth } = useAuth();
  const { theme, setTheme } = useTheme();
  const { t, locale, setLocale } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
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

  const cycleTheme = () => {
    if (theme === 'system') {
      setTheme('light');
    } else if (theme === 'light') {
      setTheme('dark');
    } else {
      setTheme('system');
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-[100dvh] w-screen overflow-hidden bg-slate-50 dark:bg-black pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
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
      <header className="md:hidden shrink-0 w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-800 z-30 pt-[env(safe-area-inset-top)] shadow-xs">
        <div className="h-14 flex items-center justify-between px-4">
          <NavLink to={user?.role === 'admin' ? '/' : '/playback'} className="flex items-center gap-2.5 no-underline group cursor-pointer">
            <div className="w-8 h-8 rounded-xl bg-orange-600 flex items-center justify-center text-white shadow-xs group-active:scale-95 transition-transform">
              <Camera size={18} />
            </div>
            <h2 className="text-base font-bold m-0 text-slate-800 dark:text-slate-100 tracking-tight">HubSight</h2>
          </NavLink>

          <div className="flex items-center gap-1">
            {/* Quick Theme Toggle on Mobile */}
            <button
              className="w-9 h-9 flex items-center justify-center rounded-md text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 active:bg-slate-100 dark:active:bg-slate-800 transition-colors touch-manipulation cursor-pointer shrink-0"
              onClick={cycleTheme}
              aria-label="Toggle theme"
              title={theme === 'system' ? t('settings.themeSystem') : theme === 'dark' ? t('settings.themeDark') : t('settings.themeLight')}
            >
              {theme === 'dark' ? (
                <Moon size={19} className="text-indigo-400" />
              ) : theme === 'light' ? (
                <Sun size={19} className="text-amber-500" />
              ) : (
                <Monitor size={19} />
              )}
            </button>

            {/* Notification Bell on Mobile */}
            <button
              className="w-9 h-9 flex items-center justify-center rounded-md text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 active:bg-slate-100 dark:active:bg-slate-800 transition-colors touch-manipulation relative cursor-pointer shrink-0"
              onClick={() => setShowNotificationDrawer(true)}
              aria-label="Notifications"
            >
              <Bell size={20} />
              {unreadNotifCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-900 animate-pulse" />
              )}
            </button>

            <button
              className="w-9 h-9 flex items-center justify-center rounded-md text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 active:bg-slate-100 dark:active:bg-slate-800 transition-colors touch-manipulation cursor-pointer shrink-0"
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
        fixed inset-y-0 left-0 z-50 bg-white dark:bg-slate-900 shadow-xl shadow-slate-200/20 dark:shadow-none border-r border-slate-200 dark:border-slate-800 flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] overflow-hidden
        transition-all duration-300 ease-in-out md:relative md:py-4
        ${isMobileMenuOpen ? 'translate-x-0 w-[270px]' : '-translate-x-full w-[270px] md:translate-x-0'}
        ${isSidebarCollapsed ? 'md:w-0 md:min-w-0 md:opacity-0 md:border-none' : 'md:w-[260px] md:min-w-[260px] md:opacity-100'}
      `}>
        <div className="flex items-center justify-between px-4 pt-2 pb-1 md:pt-0 mb-2">
          <NavLink to={user?.role === 'admin' ? '/' : '/playback'} className="flex items-center gap-2.5 no-underline group cursor-pointer">
            <div className="w-8 h-8 rounded-md bg-orange-600 flex items-center justify-center text-white shadow-xs group-hover:scale-105 transition-transform">
              <Camera size={18} />
            </div>
            <div>
              <h1 className="font-bold text-base leading-none text-slate-800 dark:text-slate-100 group-hover:text-orange-600 transition-colors">HubSight</h1>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium tracking-wide">{t('nav.subtitle')}</span>
            </div>
          </NavLink>
          <button
            className="md:hidden w-8 h-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        {/* Top User Workspace & Quick Controls (Linear / Slack pattern) */}
        <div className="relative px-3 mb-2 shrink-0" ref={userMenuRef}>
          {/* User Row with Bell Button */}
          <div className="flex items-center gap-1.5">
            {/* Profile Button */}
            <button
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className={`flex-1 min-w-0 flex items-center gap-2 p-1.5 rounded-md border transition-all text-left cursor-pointer group ${
                location.pathname === '/preferences'
                  ? 'bg-orange-50/70 dark:bg-orange-950/40 border-orange-300 dark:border-orange-500/40 shadow-xs'
                  : isUserMenuOpen
                  ? 'bg-orange-50/50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800/50 shadow-xs'
                  : 'bg-slate-50/80 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 border-slate-200/80 dark:border-slate-800'
                }`}
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 font-bold transition-colors ${user?.role === 'admin'
                  ? 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 group-hover:bg-red-100 dark:group-hover:bg-red-900/40'
                  : 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/40'
                  }`}
              >
                <UserIcon size={14} />
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate leading-tight"
                  title={user?.full_name || user?.username}
                >
                  {user?.full_name || user?.username}
                </p>
                <div className="flex items-center gap-1 mt-0.5">
                  <span
                    className={`px-1 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider shrink-0 border leading-none ${user?.role === 'admin'
                      ? 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/50'
                      : 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800/50'
                      }`}
                  >
                    {user?.role === 'admin' ? t('admin') : t('viewer')}
                  </span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono truncate">
                    @{user?.username}
                  </span>
                </div>
              </div>
              <ChevronsUpDown size={13} className="text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 shrink-0 transition-colors" />
            </button>

            {/* Notification Bell Button */}
            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                setShowNotificationDrawer(true);
              }}
              className="relative w-9 h-9 rounded-md border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white active:scale-95 transition-all cursor-pointer shrink-0 flex items-center justify-center bg-slate-50/80 dark:bg-slate-800/50 shadow-2xs"
              title={t('notifications.title')}
              aria-label={t('notifications.title')}
            >
              <Bell size={16} />
              {unreadNotifCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-0.5 rounded-full text-[9px] font-bold bg-red-500 text-white flex items-center justify-center ring-2 ring-white dark:ring-slate-900 leading-none animate-pulse">
                  {unreadNotifCount > 99 ? '99+' : unreadNotifCount}
                </span>
              )}
            </button>
          </div>

          {/* Language & 3-Way Theme Switcher Bar */}
          <div className="flex items-center justify-between gap-1 mt-1.5 p-1 bg-slate-50 dark:bg-slate-800/50 rounded-md border border-slate-200/80 dark:border-slate-800">
            {/* Language Switch */}
            <button
              onClick={handleSwitchLocale}
              className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-700/70 transition-all cursor-pointer shadow-2xs hover:shadow-xs"
              title={t('lang.switch')}
            >
              <Globe size={13} className="text-slate-400 dark:text-slate-400 shrink-0" />
              <span>{locale === 'vi' ? 'Tiếng Việt' : 'English'}</span>
            </button>

            {/* 3-Way Theme Segmented Control */}
            <div className="flex items-center gap-0.5 p-0.5 bg-slate-200/60 dark:bg-slate-900/80 rounded border border-slate-200/80 dark:border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`w-6 h-6 flex items-center justify-center rounded transition-all cursor-pointer ${
                  theme === 'light'
                    ? 'bg-white dark:bg-slate-800 text-amber-500 shadow-2xs'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
                title={t('settings.themeLight')}
                aria-label={t('settings.themeLight')}
              >
                <Sun size={13} />
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`w-6 h-6 flex items-center justify-center rounded transition-all cursor-pointer ${
                  theme === 'dark'
                    ? 'bg-white dark:bg-slate-800 text-indigo-400 shadow-2xs'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
                title={t('settings.themeDark')}
                aria-label={t('settings.themeDark')}
              >
                <Moon size={13} />
              </button>
              <button
                type="button"
                onClick={() => setTheme('system')}
                className={`w-6 h-6 flex items-center justify-center rounded transition-all cursor-pointer ${
                  theme === 'system'
                    ? 'bg-white dark:bg-slate-800 text-orange-600 dark:text-orange-400 shadow-2xs'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
                title={t('settings.themeSystem')}
                aria-label={t('settings.themeSystem')}
              >
                <Monitor size={13} />
              </button>
            </div>
          </div>

          {/* User Popover Menu - Opens DOWNWARD */}
          {isUserMenuOpen && (
            <div className="absolute top-full left-3 right-3 mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md shadow-xl dark:shadow-slate-950/60 p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 mb-1">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                  {user?.full_name || user?.username}
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 font-mono truncate">
                  @{user?.username} • {user?.role === 'admin' ? t('admin') : t('viewer')}
                </p>
              </div>

              <button
                onClick={() => {
                  setIsUserMenuOpen(false);
                  navigate('/preferences');
                }}
                className="w-full flex items-center gap-2 px-2.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 rounded transition-colors cursor-pointer"
              >
                <Sliders size={14} className="text-orange-600 shrink-0" />
                <span>{t('nav.preferences')}</span>
              </button>

              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

              <button
                onClick={() => {
                  setIsUserMenuOpen(false);
                  handleLogout();
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded transition-colors cursor-pointer"
              >
                <LogOut size={14} className="shrink-0" />
                <span>{t('nav.logout')}</span>
              </button>
            </div>
          )}
        </div>

        <nav className="flex-1 flex flex-col overflow-y-auto custom-scrollbar space-y-0.5 pb-2">
          {/* Admin Dashboard */}
          {user?.role === 'admin' && (
            <div className="mb-1">
              <NavLink
                to="/"
                end
                onClick={() => setIsMobileMenuOpen(false)}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                <House size={18} />
                {t('nav.home')}
              </NavLink>
            </div>
          )}

          {/* Section 1: Giám sát (Surveillance) */}
          <div className="px-5 pt-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 select-none">
            {t('nav.sectionSurveillance')}
          </div>
          <NavLink to="/playback" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Video size={18} />
            {t('nav.playback')}
          </NavLink>
          <NavLink to="/multiview" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <LayoutGrid size={18} />
            {t('nav.multiview')}
          </NavLink>

          {/* Section 2: Quản lý (Management) */}
          {user?.role === 'admin' && (
            <>
              <div className="px-5 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 select-none">
                {t('nav.sectionManagement')}
              </div>
              <NavLink to="/devices" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <Camera size={18} />
                {t('nav.devices')}
              </NavLink>
              <NavLink to="/members" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <Users size={18} />
                {t('nav.members')}
              </NavLink>
            </>
          )}

          {/* Section 3: Hệ thống (System) */}
          {user?.role === 'admin' && (
            <>
              <div className="px-5 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 select-none">
                {t('nav.sectionSystem')}
              </div>
              <NavLink to="/recorder" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <Activity size={18} />
                {t('nav.nvrMonitor')}
              </NavLink>
              <NavLink to="/pool" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <Layers size={18} />
                {t('nav.poolMonitor')}
              </NavLink>
            </>
          )}

          {/* Section 4: Quản trị (Administration) */}
          {(user?.role === 'admin' || user?.permissions?.includes('users:view') || user?.permissions?.includes('users:manage') || user?.permissions?.includes('roles:manage') || user?.permissions?.includes('clients:manage') || user?.permissions?.includes('service_accounts:manage') || user?.permissions?.includes('*')) && (
            <>
              <div className="px-5 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 select-none">
                {t('nav.sectionAdmin')}
              </div>
              {(user?.role === 'admin' || user?.permissions?.includes('users:view') || user?.permissions?.includes('users:manage') || user?.permissions?.includes('*')) && (
                <NavLink to="/users" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  <UserCog size={18} />
                  {t('nav.users')}
                </NavLink>
              )}
              {(user?.role === 'admin' || user?.permissions?.includes('roles:manage') || user?.permissions?.includes('*')) && (
                <NavLink to="/roles" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  <Shield size={18} />
                  {t('nav.roles')}
                </NavLink>
              )}
              {(user?.role === 'admin' || user?.permissions?.includes('clients:manage') || user?.permissions?.includes('*')) && (
                <NavLink to="/clients" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  <KeyRound size={18} />
                  {t('nav.clients')}
                </NavLink>
              )}
              {(user?.role === 'admin' || user?.permissions?.includes('service_accounts:manage') || user?.permissions?.includes('*')) && (
                <NavLink to="/service-accounts" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  <Google size={18} />
                  {t('nav.serviceAccounts')}
                </NavLink>
              )}
              {(user?.role === 'admin' || user?.permissions?.includes('app_configs:manage') || user?.permissions?.includes('mobile_configs:manage') || user?.permissions?.includes('*')) && (
                <NavLink to="/app-configs" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  <FileShield size={18} />
                  {t('nav.appConfigs')}
                </NavLink>
              )}
            </>
          )}
        </nav>

        {/* Sidebar Bottom Footer */}
        <div className="shrink-0 border-t border-slate-200/80 dark:border-slate-800/80 px-4 py-2.5 bg-white dark:bg-slate-900">
          <AppFooter />
        </div>
      </aside>

      {/* Desktop Sidebar Toggle Button */}
      <button
        onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        className={`hidden md:flex fixed top-1/2 -translate-y-1/2 z-40 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-md py-3 px-1 rounded-r-xl transition-all duration-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer ${isSidebarCollapsed ? 'left-0' : 'left-[260px]'
          }`}
        title={isSidebarCollapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
      >
        {isSidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>

      {/* Main Content Area (Natural flex flow below Mobile Header) */}
      <main className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden relative pb-[env(safe-area-inset-bottom)] md:pb-0">
        <Outlet />
      </main>
    </div>
  );
};

export default MainLayout;
