import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldAlert } from 'lucide-react';
import axiosClient from '../api/axiosClient';
import { AxiosError } from 'axios';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
        setError(error.response.data.error || 'Login failed');
      } else {
        setError('Network error');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-slate-50">
      <div className="glass-panel animate-fade-in w-full max-w-[400px] p-10 m-4">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-orange-100 mx-auto mb-4 flex items-center justify-center shadow-[0_0_20px_rgba(234,88,12,0.2)]">
            <ShieldAlert size={32} className="text-orange-600" />
          </div>
          <h2 className="text-2xl font-bold mb-2">CCTV Viewer</h2>
          <p className="text-slate-500">Sign in to continue</p>
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-500/10 text-red-500 p-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}
          
          <div className="flex flex-col gap-2 mb-5">
            <label className="text-sm text-slate-500 font-medium">Username</label>
            <input 
              type="text" 
              className="input-field" 
              value={username} 
              onChange={e => setUsername(e.target.value)} 
              required 
            />
          </div>
          
          <div className="flex flex-col gap-2 mb-6">
            <label className="text-sm text-slate-500 font-medium">Password</label>
            <input 
              type="password" 
              className="input-field" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              required 
            />
          </div>
          
          <button type="submit" className="btn w-full mt-2" disabled={loading}>
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
