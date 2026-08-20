import { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../i18n';
import type { Locale } from '../i18n';
import { Video, LogOut, User as UserIcon, Shield, KeyRound, Camera, Menu, X, Activity, ChevronLeft, ChevronRight, ChevronsUpDown, Globe } from 'lucide-react';
import ChangePasswordModal from '../components/ChangePasswordModal';
import { AppSettingsModal } from '../components/settings/AppSettingsModal';
import { AppLockScreen } from '../components/lock/AppLockScreen';
import { AppFooter } from '../components/AppFooter';
import axiosClient from '../api/axiosClient';
import { clearPwaRefreshToken } from '../utils/pwa';

const MainLayout = () => {
  const { user, checkAuth } = useAuth();
  const { t, locale, setLocale } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

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
    <div className="flex h-[100dvh] w-screen overflow-hidden bg-slate-50">
      {/* App Lock Screen Overlay */}
      <AppLockScreen />

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-white/95 backdrop-blur-md border-b border-slate-200/90 z-40 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <Shield className="text-orange-600" size={22} />
          <h2 className="text-base font-bold m-0 text-slate-800 tracking-tight">HubSight</h2>
        </div>
        <button
          className="p-2 rounded-xl text-slate-600 hover:text-slate-900 active:bg-slate-100 transition-colors touch-manipulation"
          onClick={() => setIsMobileMenuOpen(true)}
          aria-label="Open navigation menu"
        >
          <Menu size={22} />
        </button>
      </div>

      {/* Mobile Backdrop */}
      {isMobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 bg-white shadow-xl shadow-slate-200/20 border-r border-slate-200 flex flex-col py-6 overflow-hidden
        transition-all duration-300 ease-in-out md:relative
        ${isMobileMenuOpen ? 'translate-x-0 w-[260px]' : '-translate-x-full w-[260px] md:translate-x-0'}
        ${isSidebarCollapsed ? 'md:w-0 md:min-w-0 md:opacity-0 md:border-none' : 'md:w-[260px] md:min-w-[260px] md:opacity-100'}
      `}>
        <div className="flex items-center justify-between px-6 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-600 flex items-center justify-center text-white shadow-md shadow-orange-600/20">
              <Camera size={22} />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-none text-slate-800">HubSight</h1>
              <span className="text-[11px] text-slate-600 font-medium tracking-wide">{t('nav.subtitle')}</span>
            </div>
          </div>
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

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-y-auto relative pt-14 md:pt-0">
        <Outlet />
      </div>

      {showPasswordModal && <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />}
      {showSettingsModal && <AppSettingsModal onClose={() => setShowSettingsModal(false)} />}
    </div>
  );
};

export default MainLayout;
