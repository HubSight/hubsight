import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Camera, Lock, User, Eye, EyeOff, ArrowRight } from 'lucide-react';
import axiosClient from '../api/axiosClient';
import { AxiosError } from 'axios';
import { isPwa, setPwaRefreshToken, clearPwaRefreshToken } from '../utils/pwa';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { checkAuth } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const runningAsPwa = isPwa();
      const res = await axiosClient.post('/auth/login', {
        username,
        password,
        is_pwa: runningAsPwa
      });

      if (runningAsPwa && res.data?.refresh_token) {
        setPwaRefreshToken(res.data.refresh_token);
      } else {
        clearPwaRefreshToken();
      }

      await checkAuth();
      navigate('/devices');
    } catch (error) {
      if (error instanceof AxiosError && error.response) {
        setError(error.response.data.error || 'Authentication failed. Please check your credentials.');
      } else {
        setError('Unable to connect to server. Please check your network connection.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-[100dvh] w-full flex items-center justify-center bg-slate-100 p-4 sm:p-6 font-sans text-slate-800 overflow-y-auto select-none">
      
      {/* 1. Clean Subtle Gridlines */}
      <div
        className="fixed inset-0 pointer-events-none opacity-60 z-0"
        style={{
          backgroundImage: `linear-gradient(to right, rgba(148, 163, 184, 0.25) 1px, transparent 1px), linear-gradient(to bottom, rgba(148, 163, 184, 0.25) 1px, transparent 1px)`,
          backgroundSize: '32px 32px'
        }}
      />

      {/* 3. Main Login Card - Touch & Mobile Responsive */}
      <div className="relative z-10 w-full max-w-[400px] my-auto">
        <div className="bg-white/95 backdrop-blur-xl border border-slate-200/90 rounded-2xl sm:rounded-3xl p-6 sm:p-8 md:p-9 shadow-xl sm:shadow-2xl transition-all">
          {/* Header */}
          <div className="flex flex-col items-center text-center mb-6 sm:mb-8">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-orange-600 flex items-center justify-center text-white mb-3.5 shadow-md shadow-orange-600/20">
              <Camera className="w-6 h-6 sm:w-7 sm:h-7" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">CCTV Surveillance</h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">Sign in to manage devices and playback</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs sm:text-sm font-medium flex items-start gap-2 animate-fade-in">
              <span className="text-red-500 mt-0.5">•</span>
              <span className="flex-1">{error}</span>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">
                Username
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User size={18} />
                </span>
                <input
                  type="text"
                  required
                  autoFocus
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  className="w-full pl-11 pr-4 py-3 sm:py-2.5 bg-slate-50/80 border border-slate-200 rounded-xl text-base sm:text-sm text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all touch-manipulation"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock size={18} />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-11 pr-12 py-3 sm:py-2.5 bg-slate-50/80 border border-slate-200 rounded-xl text-base sm:text-sm text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all touch-manipulation"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 w-11 flex items-center justify-center text-slate-400 hover:text-slate-600 active:text-slate-800 transition-colors cursor-pointer touch-manipulation"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[46px] sm:min-h-[44px] mt-6 py-3 sm:py-2.5 px-4 bg-orange-600 hover:bg-orange-700 active:bg-orange-800 active:scale-[0.99] text-white font-semibold rounded-xl shadow-sm hover:shadow-md hover:shadow-orange-600/20 transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed touch-manipulation"
            >
              {loading ? (
                <span>Signing in...</span>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          {/* Footer inside card */}
          <div className="pt-4 mt-6 border-t border-slate-100 text-center text-xs text-slate-400 font-medium space-y-0.5">
            <div>Private Cloud NVR System</div>
            <div className="text-[11px] text-slate-400/80">&copy; anhquoctran</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
