import React, { useState, useEffect } from 'react';
import { Camera, Plus, Video } from 'lucide-react';
import axiosClient from '../api/axiosClient';
import type { DeviceType, DeviceFormData } from '../types/device';
import { DeviceCard } from '../components/device/DeviceCard';
import { DeviceModal } from '../components/device/DeviceModal';
import { BRAND_PRESETS, parseRtspUrl } from '../constants/devicePresets';
import { useTranslation } from '../i18n';

const initialFormData: DeviceFormData = {
  name: '',
  brand: 'generic',
  host: '',
  isManualUrl: false,
  builderIp: '',
  builderPort: 554,
  builderUser: 'admin',
  builderPass: '',
  builderPath: '/stream',
  builderChannel: 1,
  builderIsSub: false,
  rtspTransport: 'auto',
  rtspPort: 554,
  segmentDuration: 300,
  videoCodec: 'copy',
  audioMode: 'auto',
  extraArgs: ''
};

const Devices = () => {
  const { t } = useTranslation();
  const [devices, setDevices] = useState<DeviceType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingDeviceId, setEditingDeviceId] = useState<number | null>(null);
  const [formData, setFormData] = useState<DeviceFormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fetchDevices = async () => {
    try {
      setIsLoading(true);
      const res = await axiosClient.get('/cameras');
      setDevices(res.data || []);
    } catch (err) {
      console.error('Failed to fetch devices', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
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
        formData.builderIsSub,
        formData.builderPath
      );
      setFormData((prev) => ({ ...prev, host: generated }));
    }
  }, [
    formData.brand,
    formData.builderIp,
    formData.builderPort,
    formData.builderUser,
    formData.builderPass,
    formData.builderPath,
    formData.builderChannel,
    formData.builderIsSub,
    formData.isManualUrl
  ]);

  const handleOpenModal = (dev?: DeviceType) => {
    setError('');
    if (dev) {
      setEditingDeviceId(dev.id);
      const parsed = dev.host ? parseRtspUrl(dev.host) : null;
      setFormData({
        name: dev.name,
        brand: dev.brand || 'generic',
        host: dev.host,
        isManualUrl: false,
        builderIp: parsed?.ip || '',
        builderPort: parsed?.port || dev.rtsp_port || 554,
        builderUser: parsed?.user || 'admin',
        builderPass: parsed?.pass || '',
        builderPath: parsed?.path || '/stream',
        builderChannel: parsed?.channel || 1,
        builderIsSub: parsed?.isSub ?? false,
        rtspTransport: dev.rtsp_transport || 'auto',
        rtspPort: parsed?.port || dev.rtsp_port || 554,
        segmentDuration: dev.segment_duration || 1800,
        videoCodec: dev.video_codec || 'copy',
        audioMode: dev.audio_mode || 'auto',
        extraArgs: dev.extra_args || ''
      });
    } else {
      setEditingDeviceId(null);
      setFormData(initialFormData);
    }
    setShowModal(true);
  };

  const handleFormChange = (patch: Partial<DeviceFormData>) => {
    setFormData((prev) => ({ ...prev, ...patch }));
  };

  const handleAddFfmpegTag = (tagValue: string) => {
    setFormData((prev) => {
      if (prev.extraArgs.includes(tagValue)) return prev;
      const updated = prev.extraArgs.trim() ? `${prev.extraArgs.trim()} ${tagValue}` : tagValue;
      return { ...prev, extraArgs: updated };
    });
  };

  const handleSaveDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.name.trim()) {
      setError('Please enter a device name');
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
      segment_duration: Number(formData.segmentDuration) || 1800,
      video_codec: formData.videoCodec,
      audio_mode: formData.audioMode,
      extra_args: formData.extraArgs.trim(),
      is_active: true
    };

    try {
      if (editingDeviceId) {
        await axiosClient.put(`/cameras/${editingDeviceId}`, payload);
      } else {
        await axiosClient.post('/cameras', payload);
      }
      setShowModal(false);
      fetchDevices();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save device');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteDevice = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this device? Recording will be stopped.')) {
      return;
    }
    try {
      await axiosClient.delete(`/cameras/${id}`);
      fetchDevices();
    } catch (err) {
      console.error('Failed to delete device', err);
      alert('Failed to delete device');
    }
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 h-full flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-5 sm:mb-6 md:mb-8 gap-3 max-w-7xl w-full mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0 shadow-sm">
            <Camera className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-800 tracking-tight">
                {t('devices.title')}
              </h1>
              {devices.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-200/80 text-slate-700">
                  {devices.length}
                </span>
              )}
            </div>
            <p className="text-slate-500 text-xs sm:text-sm hidden sm:block mt-0.5">
              {t('devices.subtitle')}
            </p>
          </div>
        </div>

        {/* Add Device Button */}
        {devices.length > 0 ? (
          <button
            className="btn btn-primary px-3.5 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold flex items-center gap-1.5 shrink-0 shadow-sm cursor-pointer"
            onClick={() => handleOpenModal()}
          >
            <Plus size={16} />
            <span>{t('devices.addDevice')}</span>
          </button>
        ) : (
          <button
            className="hidden sm:flex btn btn-primary px-4 py-2 text-xs sm:text-sm font-semibold items-center gap-1.5 shrink-0 shadow-sm cursor-pointer"
            onClick={() => handleOpenModal()}
          >
            <Plus size={16} />
            <span>{t('devices.addDevice')}</span>
          </button>
        )}
      </div>

      {/* Device Content Area */}
      <div className="flex-1 flex flex-col max-w-7xl w-full mx-auto">
        {isLoading ? (
          <div className="flex justify-center items-center h-48 text-slate-400 text-sm">
            {t('devices.loading')}
          </div>
        ) : devices.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-6 sm:py-10 w-full">
            <div className="bg-white border border-slate-200/90 rounded-2xl sm:rounded-3xl p-6 sm:p-10 md:p-12 text-center shadow-sm w-full max-w-xl flex flex-col items-center">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-orange-50 border border-orange-100/80 flex items-center justify-center text-orange-600 mb-4 shadow-sm">
                <Video className="w-8 h-8 sm:w-10 sm:h-10" />
              </div>
              <h3 className="text-lg sm:text-xl md:text-2xl font-bold mb-2 text-slate-800 tracking-tight">
                {t('devices.noDevicesTitle')}
              </h3>
              <p className="text-slate-500 text-xs sm:text-sm mb-6 max-w-md leading-relaxed">
                {t('devices.noDevicesSubtitle')}
              </p>
              <button
                className="btn btn-primary w-full sm:w-auto px-7 py-3 min-h-[46px] rounded-xl flex items-center justify-center gap-2 shadow-md shadow-orange-600/20 text-sm font-semibold active:scale-[0.99] transition-all cursor-pointer touch-manipulation"
                onClick={() => handleOpenModal()}
              >
                <Plus size={18} />
                <span>{t('devices.addFirstDevice')}</span>
              </button>
            </div>

            {/* Quick feature highlights / Preset info on desktop */}
            <div className="hidden sm:grid grid-cols-3 gap-4 mt-6 w-full max-w-xl text-left">
              <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
                <div className="font-semibold text-xs text-slate-800 mb-1 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-orange-500" />
                  Preset Generators
                </div>
                <p className="text-[11px] text-slate-500 leading-normal">
                  Auto-build URLs for Dahua, Hikvision, Imou, Ezviz, TP-Link & Uniview.
                </p>
              </div>

              <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
                <div className="font-semibold text-xs text-slate-800 mb-1 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  Zero-CPU Copy
                </div>
                <p className="text-[11px] text-slate-500 leading-normal">
                  Direct stream copy recording with nearly 0% CPU consumption.
                </p>
              </div>

              <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
                <div className="font-semibold text-xs text-slate-800 mb-1 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  Smart Retention
                </div>
                <p className="text-[11px] text-slate-500 leading-normal">
                  Automatic rolling disk quota management and storage pruning.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5 sm:gap-5 pb-6">
            {devices.map((dev) => (
              <DeviceCard
                key={dev.id}
                device={dev}
                onEdit={handleOpenModal}
                onDelete={handleDeleteDevice}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <DeviceModal
          isEditing={editingDeviceId !== null}
          formData={formData}
          error={error}
          isSubmitting={isSubmitting}
          onClose={() => setShowModal(false)}
          onChange={handleFormChange}
          onSubmit={handleSaveDevice}
          onAddFfmpegTag={handleAddFfmpegTag}
        />
      )}
    </div>
  );
};

export default Devices;
