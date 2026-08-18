import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Camera, Lock, User, Eye, EyeOff, ArrowRight } from 'lucide-react';
import axiosClient from '../api/axiosClient';
import { AxiosError } from 'axios';

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
      await axiosClient.post('/auth/login', { username, password });
      await checkAuth();
      navigate('/archive');
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
    <div className="relative min-h-screen w-full flex items-center justify-center bg-slate-100 p-4 font-sans text-slate-800 overflow-hidden select-none">
      
      {/* 1. Subtle Grey Gridlines */}
      <div
        className="absolute inset-0 pointer-events-none opacity-40 z-0"
        style={{
          backgroundImage: `linear-gradient(to right, rgba(148, 163, 184, 0.3) 1px, transparent 1px), linear-gradient(to bottom, rgba(148, 163, 184, 0.3) 1px, transparent 1px)`,
          backgroundSize: '36px 36px'
        }}
      />

      {/* 2. User Provided Login Background Image */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden">
        <img
          src="/login-bg.png"
          alt="Login Background"
          className="w-full h-full object-cover opacity-70"
        />
      </div>

      {/* 3. Main Login Card */}
      <div className="relative z-10 w-full max-w-[400px]">
        <div className="bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl p-8 sm:p-10 shadow-xl">
          {/* Header */}
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-12 h-12 rounded-xl bg-orange-600 flex items-center justify-center text-white mb-4 shadow-sm">
              <Camera size={24} />
            </div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">CCTV Surveillance</h1>
            <p className="text-xs text-slate-500 mt-1">Sign in to manage devices and playback</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs font-medium">
              {error}
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Username
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User size={16} />
                </span>
                <input
                  type="text"
                  required
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Password
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock size={16} />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full mt-6 py-2.5 px-4 shadow-sm flex items-center justify-center gap-2"
            >
              {loading ? (
                <span>Signing in...</span>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-xs text-slate-400 font-medium">
          Private Cloud NVR System
        </div>
      </div>
    </div>
  );
};

export default Login;
