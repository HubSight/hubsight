import React, { useState, useEffect } from 'react';
import { Camera, Plus, Video } from 'lucide-react';
import axiosClient from '../api/axiosClient';
import type { CameraType, CameraFormData } from '../types/camera';
import { CameraCard } from '../components/camera/CameraCard';
import { CameraModal } from '../components/camera/CameraModal';
import { BRAND_PRESETS } from '../constants/cameraPresets';

const initialFormData: CameraFormData = {
  name: '',
  brand: 'generic',
  host: '',
  isManualUrl: false,
  builderIp: '',
  builderPort: 554,
  builderUser: 'admin',
  builderPass: '',
  builderChannel: 1,
  builderIsSub: false,
  rtspTransport: 'tcp',
  rtspPort: 554,
  segmentDuration: 300,
  videoCodec: 'copy',
  audioMode: 'auto',
  extraArgs: ''
};

const Cameras = () => {
  const [cameras, setCameras] = useState<CameraType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCameraId, setEditingCameraId] = useState<number | null>(null);
  const [formData, setFormData] = useState<CameraFormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fetchCameras = async () => {
    try {
      setIsLoading(true);
      const res = await axiosClient.get('/cameras');
      setCameras(res.data || []);
    } catch (err) {
      console.error('Failed to fetch cameras', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCameras();
  }, []);

  // Update generated RTSP URL when builder fields change
  useEffect(() => {
    if (!formData.isManualUrl && formData.brand) {
      const preset = BRAND_PRESETS.find((b) => b.id === formData.brand) || BRAND_PRESETS[0];
      const generated = preset.generateUrl(
        formData.builderIp,
        formData.builderPort,
        formData.builderUser,
        formData.builderPass,
        formData.builderChannel,
        formData.builderIsSub
      );
      setFormData((prev) => ({ ...prev, host: generated }));
    }
  }, [
    formData.brand,
    formData.builderIp,
    formData.builderPort,
    formData.builderUser,
    formData.builderPass,
    formData.builderChannel,
    formData.builderIsSub,
    formData.isManualUrl
  ]);

  const handleOpenModal = (cam?: CameraType) => {
    setError('');
    if (cam) {
      setEditingCameraId(cam.id);
      setFormData({
        name: cam.name,
        brand: cam.brand || 'generic',
        host: cam.host,
        isManualUrl: true,
        builderIp: '',
        builderPort: cam.rtsp_port || 554,
        builderUser: 'admin',
        builderPass: '',
        builderChannel: 1,
        builderIsSub: false,
        rtspTransport: cam.rtsp_transport || 'tcp',
        rtspPort: cam.rtsp_port || 554,
        segmentDuration: cam.segment_duration || 300,
        videoCodec: cam.video_codec || 'copy',
        audioMode: cam.audio_mode || 'auto',
        extraArgs: cam.extra_args || ''
      });
    } else {
      setEditingCameraId(null);
      setFormData(initialFormData);
    }
    setShowModal(true);
  };

  const handleFormChange = (patch: Partial<CameraFormData>) => {
    setFormData((prev) => ({ ...prev, ...patch }));
  };

  const handleAddFfmpegTag = (tagValue: string) => {
    setFormData((prev) => {
      if (prev.extraArgs.includes(tagValue)) return prev;
      const updated = prev.extraArgs.trim() ? `${prev.extraArgs.trim()} ${tagValue}` : tagValue;
      return { ...prev, extraArgs: updated };
    });
  };

  const handleSaveCamera = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.name.trim()) {
      setError('Please enter a camera name');
      return;
    }
    if (!formData.host.trim()) {
      setError('Please enter or configure an RTSP stream URL');
      return;
    }

    setIsSubmitting(true);
    const payload = {
      name: formData.name.trim(),
      host: formData.host.trim(),
      brand: formData.brand,
      rtsp_port: Number(formData.rtspPort) || 554,
      rtsp_transport: formData.rtspTransport,
      segment_duration: Number(formData.segmentDuration) || 300,
      video_codec: formData.videoCodec,
      audio_mode: formData.audioMode,
      extra_args: formData.extraArgs.trim(),
      is_active: true
    };

    try {
      if (editingCameraId) {
        await axiosClient.put(`/cameras/${editingCameraId}`, payload);
      } else {
        await axiosClient.post('/cameras', payload);
      }
      setShowModal(false);
      fetchCameras();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save camera');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCamera = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this camera? Recording will be stopped.')) {
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
    <div className="p-4 md:p-8 h-full flex flex-col bg-slate-50">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 md:mb-8 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold mb-2 flex items-center gap-3 text-slate-800">
            <Camera className="text-orange-600" size={32} />
            Device Management
          </h1>
          <p className="text-slate-500 text-sm md:text-base">
            Configure RTSP streams by brand, customize transport protocols, and FFmpeg recording options.
          </p>
        </div>
        <button
          className="btn btn-primary flex items-center gap-2 w-full sm:w-auto justify-center shadow-sm"
          onClick={() => handleOpenModal()}
        >
          <Plus size={20} /> Add Camera
        </button>
      </div>

      {/* Camera Grid */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex justify-center items-center h-40 text-slate-400">Loading cameras...</div>
        ) : cameras.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
            <Video size={48} className="mx-auto text-slate-400 mb-4" />
            <h3 className="text-xl font-semibold mb-2 text-slate-800">No cameras configured</h3>
            <p className="text-slate-500 mb-6 max-w-md mx-auto">
              Add an RTSP camera stream to start automated recording and archiving.
            </p>
            <button
              className="btn btn-primary inline-flex items-center gap-2 shadow-sm"
              onClick={() => handleOpenModal()}
            >
              <Plus size={20} /> Add Your First Camera
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6 pb-6">
            {cameras.map((cam) => (
              <CameraCard
                key={cam.id}
                camera={cam}
                onEdit={handleOpenModal}
                onDelete={handleDeleteCamera}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <CameraModal
          isEditing={editingCameraId !== null}
          formData={formData}
          error={error}
          isSubmitting={isSubmitting}
          onClose={() => setShowModal(false)}
          onChange={handleFormChange}
          onSubmit={handleSaveCamera}
          onAddFfmpegTag={handleAddFfmpegTag}
        />
      )}
    </div>
  );
};

export default Cameras;
