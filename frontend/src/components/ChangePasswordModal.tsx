import { useState } from 'react';
import axiosClient from '../api/axiosClient';
import { AxiosError } from 'axios';

const ChangePasswordModal = ({ onClose }: { onClose: () => void }) => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      await axiosClient.put('/auth/password', { old_password: oldPassword, new_password: newPassword });
      setSuccess('Password updated successfully');
      setTimeout(() => onClose(), 1500);
    } catch (error) {
      if (error instanceof AxiosError && error.response) {
        setError(error.response.data.error || 'Failed to update password');
      } else {
        setError('Network error');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div className="glass-panel animate-slide-up w-full max-w-[400px] p-8 m-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-2xl font-bold mb-6">Change Password</h2>
        
        {error && <div className="text-red-500 mb-4 text-sm">{error}</div>}
        {success && <div className="text-emerald-500 mb-4 text-sm">{success}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-2 mb-4">
            <label className="text-sm text-slate-400 font-medium">Old Password</label>
            <input type="password" required className="input-field" value={oldPassword} onChange={e => setOldPassword(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2 mb-6">
            <label className="text-sm text-slate-400 font-medium">New Password</label>
            <input type="password" required className="input-field" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
          </div>
          
          <div className="flex gap-3 mt-6">
            <button type="button" className="btn btn-secondary flex-1" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn flex-1" disabled={loading}>{loading ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChangePasswordModal;
