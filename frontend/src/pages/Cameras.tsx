import React, { useState, useEffect } from 'react';
import { Camera, Plus, Trash2, Video, Pencil } from 'lucide-react';
import axiosClient from '../api/axiosClient';

interface CameraType {
  id: number;
  name: string;
  host: string;
  is_active: boolean;
  created_at: string;
}

const Cameras = () => {
  const [cameras, setCameras] = useState<CameraType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCameraId, setEditingCameraId] = useState<number | null>(null);
  const [newName, setNewName] = useState('');
  const [newHost, setNewHost] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fetchCameras = async () => {
    try {
      setIsLoading(true);
      const res = await axiosClient.get('/cameras');
      setCameras(res.data || []);
    } catch (error) {
      console.error('Failed to fetch cameras', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCameras();
  }, []);

  const openModal = (cam?: CameraType) => {
    if (cam) {
      setEditingCameraId(cam.id);
      setNewName(cam.name);
      setNewHost(cam.host);
    } else {
      setEditingCameraId(null);
      setNewName('');
      setNewHost('');
    }
    setError('');
    setShowAddModal(true);
  };

  const handleSaveCamera = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      if (editingCameraId) {
        await axiosClient.put(`/cameras/${editingCameraId}`, { name: newName, host: newHost });
      } else {
        await axiosClient.post('/cameras', { name: newName, host: newHost });
      }
      setShowAddModal(false);
      fetchCameras();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save camera');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCamera = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this camera? This will stop recording.')) {
      return;
    }

    try {
      await axiosClient.delete(`/cameras/${id}`);
      fetchCameras();
    } catch (err) {
      console.error('Failed to delete camera', err);
      alert('Failed to delete camera');
    }
  };

  return (
    <div className="p-4 md:p-8 h-full flex flex-col">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 md:mb-8 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold mb-2 flex items-center gap-3 text-slate-800">
            <Camera className="text-orange-600" size={32} />
            Camera Management
          </h1>
          <p className="text-slate-500 text-sm md:text-base">Manage your RTSP camera streams and recording settings.</p>
        </div>
        <button
          className="btn btn-primary flex items-center gap-2 w-full sm:w-auto justify-center"
          onClick={() => openModal()}
        >
          <Plus size={20} /> Add Camera
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex justify-center items-center h-40 text-slate-400">Loading cameras...</div>
        ) : cameras.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
            <Video size={48} className="mx-auto text-slate-400 mb-4" />
            <h3 className="text-xl font-semibold mb-2 text-slate-800">No cameras configured</h3>
            <p className="text-slate-500 mb-6 max-w-md mx-auto">
              You haven't added any cameras yet. Add an RTSP stream to start recording and archiving video.
            </p>
            <button
              className="btn btn-primary inline-flex items-center gap-2"
              onClick={() => openModal()}
            >
              <Plus size={20} /> Add Your First Camera
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6 pb-6">
            {cameras.map((cam) => (
              <div key={cam.id} className="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors shadow-sm">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${cam.is_active ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.4)]' : 'bg-red-500'}`}></div>
                    <h3 className="font-semibold text-lg text-slate-800">{cam.name}</h3>
                  </div>
                  <div className="flex items-center">
                    <button
                      onClick={() => openModal(cam)}
                      className="text-slate-400 hover:text-orange-600 transition-colors p-2 rounded-lg hover:bg-orange-50"
                      title="Edit camera"
                    >
                      <Pencil size={18} />
                    </button>
                    <button
                      onClick={() => handleDeleteCamera(cam.id)}
                      className="text-slate-400 hover:text-red-600 transition-colors p-2 rounded-lg hover:bg-red-50"
                      title="Delete camera"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
                <div className="text-sm text-slate-600 font-mono bg-slate-50 border border-slate-100 p-2 rounded break-all">
                  {cam.host}
                </div>
                <div className="mt-4 text-xs text-slate-400 flex justify-between">
                  <span>ID: {cam.id}</span>
                  <span>Added: {new Date(cam.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-6">
              <h2 className="text-2xl font-bold mb-6 text-slate-800">{editingCameraId ? 'Edit Camera' : 'Add New Camera'}</h2>
              
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-6 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSaveCamera}>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-600 mb-2">Camera Name</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="input-field w-full"
                    placeholder="e.g. Front Door"
                    required
                  />
                </div>
                
                <div className="mb-6">
                  <label className="block text-sm font-medium text-slate-600 mb-2">RTSP Stream URL</label>
                  <input
                    type="text"
                    value={newHost}
                    onChange={(e) => setNewHost(e.target.value)}
                    className="input-field w-full font-mono text-sm"
                    placeholder="rtsp://admin:123@192.168.1.10:554/stream"
                    required
                  />
                  <p className="text-xs text-slate-400 mt-2">
                    The recorder will automatically connect to this stream via FFmpeg.
                  </p>
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    className="btn btn-secondary px-6"
                    onClick={() => setShowAddModal(false)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary px-6"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Saving...' : (editingCameraId ? 'Save Changes' : 'Add Camera')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Cameras;
