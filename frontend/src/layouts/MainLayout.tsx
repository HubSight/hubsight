import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Video, LogOut, User as UserIcon, Shield, KeyRound, Camera, Menu, X, Activity } from 'lucide-react';
import ChangePasswordModal from '../components/ChangePasswordModal';
import axiosClient from '../api/axiosClient';

const MainLayout = () => {
  const { user, checkAuth } = useAuth();
  const navigate = useNavigate();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await axiosClient.post('/auth/logout');
    await checkAuth();
    navigate('/login');
  };

  return (
    <div className="flex h-[100dvh] w-screen overflow-hidden bg-slate-50">

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
        fixed inset-y-0 left-0 z-50 w-[260px] min-w-[260px] shrink-0 bg-white border-r border-slate-200 flex flex-col py-6 
        transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex items-center justify-between mb-8 px-6">
          <div className="flex items-center gap-3">
            <Shield className="text-orange-600" size={28} />
            <h2 className="text-xl font-bold m-0 hidden md:block text-slate-800">CCTV Viewer</h2>
            <h2 className="text-xl font-bold m-0 md:hidden text-slate-800">Menu</h2>
          </div>
          <button
            className="md:hidden p-1 text-slate-500 hover:text-slate-800"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 flex flex-col">
          <NavLink to="/devices" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Camera size={20} />
            Devices
          </NavLink>
          <NavLink to="/archive" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Video size={20} />
            Playback
          </NavLink>
          <NavLink to="/recorder" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Activity size={20} />
            NVR Monitor
          </NavLink>
        </nav>

        <div className="mt-auto border-t border-slate-200 pt-6 px-6">
          <div className="flex items-center gap-3 mb-4 px-2">
            <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
              <UserIcon size={18} className="text-orange-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-800">{user?.username}</p>
              <p className="text-xs text-slate-500">Administrator</p>
            </div>
          </div>
          <button
            onClick={() => setShowPasswordModal(true)}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors mb-2"
          >
            <KeyRound size={16} />
            Change Password
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 rounded-lg transition-colors"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-y-auto relative pt-14 md:pt-0">
        <Outlet />
      </div>

      {showPasswordModal && <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />}
    </div>
  );
};

export default MainLayout;
