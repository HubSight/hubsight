import React, { useState, useEffect } from 'react';
import { Camera, Video } from 'lucide-react';
import { api } from '../api/client';
import type { DeviceType, DeviceFormData } from '../types/device';
import { DeviceCard } from '../components/device/DeviceCard';
import { DeviceModal } from '../components/device/DeviceModal';
import { DeviceScanModal, type ScanCandidate } from '../components/device/DeviceScanModal';
import { AddDeviceSplitButton } from '../components/device/AddDeviceSplitButton';
import { BRAND_PRESETS, parseRtspUrl } from '../constants/devicePresets';
import { useTranslation } from '../i18n';
import { DevicesSkeleton } from '../components/common/Skeleton';
import { PullToRefresh } from '../components/common/PullToRefresh';
import { ConfirmDialog } from '../components/common/ConfirmDialog';

const initialFormData: DeviceFormData = {
  name: '',
  brand: 'generic',
  host: '',
  isManualUrl: false,
  builderIp: '',
  builderPort: 554,
  builderUser: '',
  builderPass: '',
  builderPath: '/stream',
  builderChannel: 1,
  builderIsSub: false,
  rtspTransport: 'tcp',
  rtspPort: 554,
  segmentDuration: 300,
  videoCodec: 'copy',
  audioMode: 'auto',
  extraArgs: '',
  enable_ai: false,
  show_bbox: true,
  nvr_mode: 'event',
  record_quality: 'standard'
};

const Devices = () => {
  const { t } = useTranslation();
  const [devices, setDevices] = useState<DeviceType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [formData, setFormData] = useState<DeviceFormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pendingStopId, setPendingStopId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchDevices = async () => {
    try {
      setIsLoading(true);
      setDevices(await api.cameras.list());
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
        builderUser: parsed?.user || '',
        builderPass: parsed?.pass || '',
        builderPath: parsed?.path || '/stream',
        builderChannel: parsed?.channel || 1,
        builderIsSub: parsed?.isSub ?? false,
        rtspTransport: 'tcp',
        rtspPort: parsed?.port || dev.rtsp_port || 554,
        segmentDuration: dev.segment_duration || 1800,
        videoCodec: dev.video_codec || 'copy',
        audioMode: dev.audio_mode || 'auto',
        extraArgs: dev.extra_args || '',
        enable_ai: dev.enable_ai || false,
        show_bbox: dev.show_bbox !== false,
        nvr_mode: dev.nvr_mode || 'event',
        record_quality: dev.record_quality || 'standard'
      });
    } else {
      setEditingDeviceId(null);
      setFormData(initialFormData);
    }
    setShowModal(true);
  };

  const handleConfigureScanned = (c: ScanCandidate) => {
    setShowScan(false);
    setError('');
    setEditingDeviceId(null);
    setFormData({
      ...initialFormData,
      name: `Camera ${c.ip}`,
      brand: c.brand || 'generic',
      host: c.rtsp_url,
      builderIp: c.ip,
      builderPort: c.port || 554,
      builderPath: c.path || '/stream',
      rtspPort: c.port || 554,
    });
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
      rtsp_transport: 'tcp',
      segment_duration: Number(formData.segmentDuration) || 1800,
      video_codec: formData.videoCodec,
      audio_mode: formData.audioMode,
      extra_args: formData.extraArgs.trim(),
      is_active: true,
      enable_ai: formData.enable_ai,
      show_bbox: formData.show_bbox !== false,
      nvr_mode: formData.nvr_mode || 'event',
      record_quality: formData.record_quality || 'standard'
    };

    try {
      if (editingDeviceId) {
        const editingDevice = devices.find((d) => d.id === editingDeviceId);
        const isRunning = !!(editingDevice && editingDevice.is_active && !editingDevice.is_stopped);

        await api.cameras.update(editingDeviceId, payload);

        if (isRunning) {
          // Immediately flush connections and recreate with new config
          await api.cameras.restart(editingDeviceId);
        }
      } else {
        await api.cameras.create(payload);
      }
      setShowModal(false);
      fetchDevices();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save device');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteDevice = (id: string) => {
    setPendingDeleteId(id);
  };

  const handleStopDevice = (dev: DeviceType) => {
    setPendingStopId(dev.id);
  };

  const executeStopDevice = async () => {
    if (!pendingStopId) return;
    try {
      setTogglingId(pendingStopId);
      await api.cameras.stop(pendingStopId);
      setPendingStopId(null);
      fetchDevices();
    } catch (err) {
      console.error('Failed to stop device', err);
      setError(t('common.errorOccurred'));
    } finally {
      setTogglingId(null);
    }
  };

  const handleStartDevice = async (dev: DeviceType) => {
    try {
      setTogglingId(dev.id);
      await api.cameras.start(dev.id);
      fetchDevices();
    } catch (err) {
      console.error('Failed to start device', err);
      setError(t('common.errorOccurred'));
    } finally {
      setTogglingId(null);
    }
  };

  const handleRestartDevice = async (dev: DeviceType) => {
    try {
      setTogglingId(dev.id);
      await api.cameras.restart(dev.id);
      fetchDevices();
    } catch (err) {
      console.error('Failed to restart device', err);
      setError(t('common.errorOccurred'));
    } finally {
      setTogglingId(null);
    }
  };

  const executeDeleteDevice = async () => {
    if (!pendingDeleteId) return;
    try {
      setIsDeleting(true);
      await api.cameras.remove(pendingDeleteId);
      setPendingDeleteId(null);
      fetchDevices();
    } catch (err) {
      console.error('Failed to delete device', err);
      setError(t('common.errorOccurred'));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <PullToRefresh onRefresh={fetchDevices} className="p-4 sm:p-6 md:p-8 h-full flex flex-col overflow-y-auto">
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

        <AddDeviceSplitButton
          className={`shrink-0 ${devices.length === 0 ? 'hidden sm:inline-flex' : ''}`}
          onManual={() => handleOpenModal()}
          onScan={() => setShowScan(true)}
        />
      </div>

      {/* Device Content Area */}
      <div className="flex-1 flex flex-col max-w-7xl w-full mx-auto">
        {isLoading ? (
          <DevicesSkeleton />
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
              <AddDeviceSplitButton
                size="lg"
                onManual={() => handleOpenModal()}
                onScan={() => setShowScan(true)}
              />
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
          <div className="grid grid-cols-1 min-[960px]:grid-cols-2 2xl:grid-cols-3 gap-4 sm:gap-5 pb-6">
            {devices.map((dev) => (
              <DeviceCard
                key={dev.id}
                device={dev}
                onEdit={handleOpenModal}
                onDelete={handleDeleteDevice}
                onStop={handleStopDevice}
                onStart={handleStartDevice}
                onRestart={handleRestartDevice}
                isToggling={togglingId === dev.id}
              />
            ))}
          </div>
        )}
      </div>

      <DeviceScanModal
        isOpen={showScan}
        onClose={() => setShowScan(false)}
        onImported={fetchDevices}
        onConfigure={handleConfigureScanned}
      />

      {/* Add / Edit Modal */}
      {showModal && (
        <DeviceModal
          isEditing={editingDeviceId !== null}
          isStreaming={editingDeviceId !== null ? (() => {
            const dev = devices.find(d => d.id === editingDeviceId);
            return dev ? (dev.is_active && !dev.is_stopped) : false;
          })() : false}
          formData={formData}
          error={error}
          isSubmitting={isSubmitting}
          onClose={() => setShowModal(false)}
          onChange={handleFormChange}
          onSubmit={handleSaveDevice}
          onAddFfmpegTag={handleAddFfmpegTag}
        />
      )}

      <ConfirmDialog
        isOpen={!!pendingDeleteId}
        title={t('devices.confirmDeleteTitle')}
        message={t('devices.confirmDelete')}
        confirmLabel={t('devices.deleteDevice')}
        isLoading={isDeleting}
        onConfirm={executeDeleteDevice}
        onCancel={() => {
          if (!isDeleting) setPendingDeleteId(null);
        }}
      />

      <ConfirmDialog
        isOpen={!!pendingStopId}
        title={t('devices.confirmStopTitle')}
        message={t('devices.confirmStop')}
        confirmLabel={t('devices.stopDevice')}
        variant="primary"
        isLoading={togglingId === pendingStopId}
        onConfirm={executeStopDevice}
        onCancel={() => {
          if (!togglingId) setPendingStopId(null);
        }}
      />
    </PullToRefresh>
  );
};

export default Devices;
