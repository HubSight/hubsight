import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Video, LogOut, User as UserIcon, Shield, KeyRound, Camera, Menu, X, Activity } from 'lucide-react';
import ChangePasswordModal from '../components/ChangePasswordModal';
import { AppSettingsModal } from '../components/settings/AppSettingsModal';
import { AppLockScreen } from '../components/lock/AppLockScreen';
import axiosClient from '../api/axiosClient';
import { clearPwaRefreshToken } from '../utils/pwa';

const MainLayout = () => {
  const { user, checkAuth } = useAuth();
  const navigate = useNavigate();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    clearPwaRefreshToken();
    await axiosClient.post('/auth/logout');
    await checkAuth();
    navigate('/login');
  };

  return (
    <div className="flex h-[100dvh] w-screen overflow-hidden bg-slate-50">
      {/* App Lock Screen Overlay */}
      <AppLockScreen />
      
      {/* Background Grid */}
      <div
        className="fixed inset-0 pointer-events-none opacity-60 z-0"
        style={{
          backgroundImage: `linear-gradient(to right, rgba(148, 163, 184, 0.25) 1px, transparent 1px), linear-gradient(to bottom, rgba(148, 163, 184, 0.25) 1px, transparent 1px)`,
          backgroundSize: '32px 32px'
        }}
      />


      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-white/95 backdrop-blur-md border-b border-slate-200/90 z-40 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <Shield className="text-orange-600" size={22} />
          <h2 className="text-base font-bold m-0 text-slate-800 tracking-tight">CCTV Viewer</h2>
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
        fixed inset-y-0 left-0 z-50 w-[260px] min-w-[260px] shrink-0 bg-white shadow-[4px_0_24px_rgba(148,163,184,0.25)] border-r border-slate-200/80 flex flex-col py-6 
        transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex items-center justify-between px-6 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-600 flex items-center justify-center text-white shadow-md shadow-orange-600/20">
              <Camera size={22} />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-none text-slate-800">CCTV Viewer</h1>
              <span className="text-[11px] text-slate-600 font-medium tracking-wide">Live Surveillance</span>
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
              Devices
            </NavLink>
          )}
          <NavLink to="/playback" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Video size={20} />
            Playback
          </NavLink>
          {user?.role === 'admin' && (
            <NavLink to="/recorder" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <Activity size={20} />
              NVR Monitor
            </NavLink>
          )}
        </nav>

        <div className="mt-auto border-t border-slate-200 pt-5 px-6">
          <div className="flex items-center gap-3 mb-3 px-2">
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                user?.role === 'admin' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
              }`}
            >
              <UserIcon size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p
                className="text-sm font-bold text-slate-800 truncate leading-tight"
                title={user?.full_name || user?.username}
              >
                {user?.full_name || user?.username}
              </p>
              <div className="flex items-center gap-1.5 mt-1">
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shrink-0 border leading-none ${
                    user?.role === 'admin'
                      ? 'bg-red-50 text-red-600 border-red-200'
                      : 'bg-blue-50 text-blue-600 border-blue-200'
                  }`}
                >
                  {user?.role === 'admin' ? 'Admin' : 'Viewer'}
                </span>
                <span className="text-xs text-slate-400 font-mono truncate">
                  @{user?.username}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={() => setShowSettingsModal(true)}
            className="w-full flex items-center gap-3 px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors mb-1 cursor-pointer"
          >
            <Shield size={15} className="text-orange-600" />
            Security & App Lock
          </button>

          <button
            onClick={() => setShowPasswordModal(true)}
            className="w-full flex items-center gap-3 px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors mb-1 cursor-pointer"
          >
            <KeyRound size={15} />
            Change Password
          </button>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 rounded-lg transition-colors cursor-pointer"
          >
            <LogOut size={15} />
            Logout
          </button>
        </div>
      </aside>

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
