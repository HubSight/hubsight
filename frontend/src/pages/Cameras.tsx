import React, { useState, useEffect } from 'react';
import { Camera, Plus, Trash2, Video, Pencil, Check } from 'lucide-react';
import axiosClient from '../api/axiosClient';

interface CameraType {
  id: number;
  name: string;
  host: string;
  brand: string;
  rtsp_port: number;
  rtsp_transport: string;
  segment_duration: number;
  video_codec: string;
  audio_mode: string;
  extra_args: string;
  is_active: boolean;
  created_at: string;
}

interface BrandPreset {
  id: string;
  name: string;
  defaultPort: number;
  defaultUser: string;
  generateUrl: (ip: string, port: number, user: string, pass: string, channel: number, isSub: boolean) => string;
}

const BRAND_PRESETS: BrandPreset[] = [
  {
    id: 'generic',
    name: 'Generic / Tùy chỉnh',
    defaultPort: 554,
    defaultUser: 'admin',
    generateUrl: (ip, port, user, pass, _channel, _isSub) => {
      const auth = user ? (pass ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@` : `${encodeURIComponent(user)}@`) : '';
      return `rtsp://${auth}${ip || '192.168.1.100'}:${port || 554}/live`;
    }
  },
  {
    id: 'hikvision',
    name: 'Hikvision',
    defaultPort: 554,
    defaultUser: 'admin',
    generateUrl: (ip, port, user, pass, channel, isSub) => {
      const auth = user ? (pass ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@` : `${encodeURIComponent(user)}@`) : '';
      const streamNum = isSub ? '02' : '01';
      return `rtsp://${auth}${ip || '192.168.1.100'}:${port || 554}/Streaming/Channels/${channel}${streamNum}`;
    }
  },
  {
    id: 'dahua',
    name: 'Dahua / IMOU',
    defaultPort: 554,
    defaultUser: 'admin',
    generateUrl: (ip, port, user, pass, channel, isSub) => {
      const auth = user ? (pass ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@` : `${encodeURIComponent(user)}@`) : '';
      const subtype = isSub ? 1 : 0;
      return `rtsp://${auth}${ip || '192.168.1.100'}:${port || 554}/cam/realmonitor?channel=${channel}&subtype=${subtype}`;
    }
  },
  {
    id: 'tapo',
    name: 'TP-Link / Tapo',
    defaultPort: 554,
    defaultUser: 'admin',
    generateUrl: (ip, port, user, pass, _channel, isSub) => {
      const auth = user ? (pass ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@` : `${encodeURIComponent(user)}@`) : '';
      const streamName = isSub ? 'stream2' : 'stream1';
      return `rtsp://${auth}${ip || '192.168.1.100'}:${port || 554}/${streamName}`;
    }
  },
  {
    id: 'ezviz',
    name: 'EZVIZ',
    defaultPort: 554,
    defaultUser: 'admin',
    generateUrl: (ip, port, user, pass, _channel, isSub) => {
      const auth = user ? (pass ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@` : `${encodeURIComponent(user)}@`) : '';
      const streamType = isSub ? 'sub' : 'main';
      return `rtsp://${auth}${ip || '192.168.1.100'}:${port || 554}/h264/ch1/${streamType}/av_stream`;
    }
  },
  {
    id: 'yoosee',
    name: 'Yoosee',
    defaultPort: 554,
    defaultUser: 'admin',
    generateUrl: (ip, port, user, pass, _channel, isSub) => {
      const auth = user ? (pass ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@` : `${encodeURIComponent(user)}@`) : '';
      const onvifPath = isSub ? 'onvif2' : 'onvif1';
      return `rtsp://${auth}${ip || '192.168.1.100'}:${port || 554}/${onvifPath}`;
    }
  },
  {
    id: 'reolink',
    name: 'Reolink',
    defaultPort: 554,
    defaultUser: 'admin',
    generateUrl: (ip, port, user, pass, channel, isSub) => {
      const auth = user ? (pass ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@` : `${encodeURIComponent(user)}@`) : '';
      const streamType = isSub ? 'sub' : 'main';
      const chStr = channel < 10 ? `0${channel}` : `${channel}`;
      return `rtsp://${auth}${ip || '192.168.1.100'}:${port || 554}/h264Preview_${chStr}_${streamType}`;
    }
  },
  {
    id: 'uniview',
    name: 'Uniview (UNV)',
    defaultPort: 554,
    defaultUser: 'admin',
    generateUrl: (ip, port, user, pass, channel, isSub) => {
      const auth = user ? (pass ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@` : `${encodeURIComponent(user)}@`) : '';
      const streamNum = isSub ? 1 : 0;
      return `rtsp://${auth}${ip || '192.168.1.100'}:${port || 554}/unicast/c${channel}/s${streamNum}/live`;
    }
  },
  {
    id: 'axis',
    name: 'Axis',
    defaultPort: 554,
    defaultUser: 'root',
    generateUrl: (ip, port, user, pass, _channel, _isSub) => {
      const auth = user ? (pass ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@` : `${encodeURIComponent(user)}@`) : '';
      return `rtsp://${auth}${ip || '192.168.1.100'}:${port || 554}/axis-media/media.amp`;
    }
  },
  {
    id: 'hanwha',
    name: 'Hanwha / Samsung',
    defaultPort: 554,
    defaultUser: 'admin',
    generateUrl: (ip, port, user, pass, _channel, isSub) => {
      const auth = user ? (pass ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@` : `${encodeURIComponent(user)}@`) : '';
      const profile = isSub ? 'profile1' : 'profile2';
      return `rtsp://${auth}${ip || '192.168.1.100'}:${port || 554}/${profile}/media.smp`;
    }
  }
];

const FFMPEG_PRESET_TAGS = [
  { label: 'Low Buffering', value: '-fflags nobuffer', desc: 'Giảm độ trễ đệm luồng' },
  { label: 'Fast Probe', value: '-probesize 32 -analyzeduration 0', desc: 'Khởi động kết nối nhanh hơn' },
  { label: 'Auto Reconnect', value: '-reconnect 1 -reconnect_at_eof 1 -reconnect_streamed 1', desc: 'Tự kết nối lại khi rớt mạng' },
  { label: 'Quiet Log', value: '-loglevel warning', desc: 'Ẩn log thừa' },
  { label: 'HW Accel', value: '-hwaccel auto', desc: 'Kích hoạt phần cứng nếu có' },
  { label: 'Drop Corrupted', value: '-flags +drop_pkts', desc: 'Bỏ qua gói tin hỏng' }
];

const Cameras = () => {
  const [cameras, setCameras] = useState<CameraType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'rtsp' | 'ffmpeg'>('general');
  const [editingCameraId, setEditingCameraId] = useState<number | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('generic');
  const [host, setHost] = useState('');
  const [isManualUrl, setIsManualUrl] = useState(false);

  // URL Builder helper fields
  const [builderIp, setBuilderIp] = useState('');
  const [builderPort, setBuilderPort] = useState(554);
  const [builderUser, setBuilderUser] = useState('admin');
  const [builderPass, setBuilderPass] = useState('');
  const [builderChannel, setBuilderChannel] = useState(1);
  const [builderIsSub, setBuilderIsSub] = useState(false);

  // RTSP Options
  const [rtspTransport, setRtspTransport] = useState('tcp');
  const [rtspPort, setRtspPort] = useState(554);

  // FFmpeg Options
  const [segmentDuration, setSegmentDuration] = useState(300);
  const [videoCodec, setVideoCodec] = useState('copy');
  const [audioMode, setAudioMode] = useState('copy');
  const [extraArgs, setExtraArgs] = useState('');

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
    if (!isManualUrl && brand) {
      const preset = BRAND_PRESETS.find(b => b.id === brand) || BRAND_PRESETS[0];
      const generated = preset.generateUrl(
        builderIp,
        builderPort,
        builderUser,
        builderPass,
        builderChannel,
        builderIsSub
      );
      setHost(generated);
    }
  }, [brand, builderIp, builderPort, builderUser, builderPass, builderChannel, builderIsSub, isManualUrl]);

  const handleBrandChange = (newBrand: string) => {
    setBrand(newBrand);
    const preset = BRAND_PRESETS.find(b => b.id === newBrand);
    if (preset) {
      setBuilderPort(preset.defaultPort);
      setRtspPort(preset.defaultPort);
      setBuilderUser(preset.defaultUser);
    }
  };

  const openModal = (cam?: CameraType) => {
    setError('');
    setActiveTab('general');
    if (cam) {
      setEditingCameraId(cam.id);
      setName(cam.name);
      setBrand(cam.brand || 'generic');
      setHost(cam.host);
      setIsManualUrl(true); // Default to manual view for existing raw URLs
      setRtspPort(cam.rtsp_port || 554);
      setRtspTransport(cam.rtsp_transport || 'tcp');
      setSegmentDuration(cam.segment_duration || 300);
      setVideoCodec(cam.video_codec || 'copy');
      setAudioMode(cam.audio_mode || 'copy');
      setExtraArgs(cam.extra_args || '');
    } else {
      setEditingCameraId(null);
      setName('');
      setBrand('generic');
      setHost('');
      setIsManualUrl(false);
      setBuilderIp('');
      setBuilderPort(554);
      setBuilderUser('admin');
      setBuilderPass('');
      setBuilderChannel(1);
      setBuilderIsSub(false);
      setRtspPort(554);
      setRtspTransport('tcp');
      setSegmentDuration(300);
      setVideoCodec('copy');
      setAudioMode('copy');
      setExtraArgs('');
    }
    setShowModal(true);
  };

  const handleAddFfmpegTag = (tagValue: string) => {
    if (extraArgs.includes(tagValue)) return;
    setExtraArgs(prev => (prev.trim() ? `${prev.trim()} ${tagValue}` : tagValue));
  };

  const handleSaveCamera = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Vui lòng nhập tên camera');
      return;
    }
    if (!host.trim()) {
      setError('Vui lòng nhập hoặc cấu hình RTSP Stream URL');
      return;
    }

    setIsSubmitting(true);

    const payload = {
      name: name.trim(),
      host: host.trim(),
      brand,
      rtsp_port: Number(rtspPort) || 554,
      rtsp_transport: rtspTransport,
      segment_duration: Number(segmentDuration) || 300,
      video_codec: videoCodec,
      audio_mode: audioMode,
      extra_args: extraArgs.trim(),
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
      setError(err.response?.data?.error || 'Không thể lưu camera');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCamera = async (id: number) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa camera này? Quá trình ghi hình sẽ dừng lại.')) {
      return;
    }

    try {
      await axiosClient.delete(`/cameras/${id}`);
      fetchCameras();
    } catch (err) {
      console.error('Failed to delete camera', err);
      alert('Không thể xóa camera');
    }
  };

  const getBrandName = (brandId: string) => {
    const found = BRAND_PRESETS.find(b => b.id === brandId);
    return found ? found.name : brandId || 'Generic';
  };

  return (
    <div className="p-4 md:p-8 h-full flex flex-col bg-slate-50">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 md:mb-8 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold mb-2 flex items-center gap-3 text-slate-800">
            <Camera className="text-orange-600" size={32} />
            Quản lý Camera
          </h1>
          <p className="text-slate-500 text-sm md:text-base">
            Cấu hình luồng RTSP theo hãng, tùy chỉnh transport và tham số FFmpeg ghi hình.
          </p>
        </div>
        <button
          className="btn btn-primary flex items-center gap-2 w-full sm:w-auto justify-center shadow-sm"
          onClick={() => openModal()}
        >
          <Plus size={20} /> Thêm Camera Mới
        </button>
      </div>

      {/* Camera Grid */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex justify-center items-center h-40 text-slate-400">Đang tải danh sách camera...</div>
        ) : cameras.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
            <Video size={48} className="mx-auto text-slate-400 mb-4" />
            <h3 className="text-xl font-semibold mb-2 text-slate-800">Chưa có camera nào</h3>
            <p className="text-slate-500 mb-6 max-w-md mx-auto">
              Thêm luồng RTSP camera để bắt đầu tự động ghi hình và lưu trữ video.
            </p>
            <button
              className="btn btn-primary inline-flex items-center gap-2 shadow-sm"
              onClick={() => openModal()}
            >
              <Plus size={20} /> Thêm Camera Đầu Tiên
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6 pb-6">
            {cameras.map((cam) => (
              <div key={cam.id} className="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${cam.is_active ? 'bg-green-500 shadow-sm' : 'bg-red-500'}`}></div>
                      <div>
                        <h3 className="font-semibold text-lg text-slate-800">{cam.name}</h3>
                        <span className="inline-block px-2 py-0.5 bg-orange-50 text-orange-600 rounded text-xs font-medium border border-orange-200">
                          {getBrandName(cam.brand)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openModal(cam)}
                        className="text-slate-400 hover:text-orange-600 transition-colors p-2 rounded-lg hover:bg-orange-50"
                        title="Chỉnh sửa camera"
                      >
                        <Pencil size={18} />
                      </button>
                      <button
                        onClick={() => handleDeleteCamera(cam.id)}
                        className="text-slate-400 hover:text-red-600 transition-colors p-2 rounded-lg hover:bg-red-50"
                        title="Xóa camera"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>

                  <div className="text-xs text-slate-600 font-mono bg-slate-50 border border-slate-200 p-2.5 rounded break-all mb-3">
                    {cam.host}
                  </div>

                  {/* Badges / Options summary */}
                  <div className="flex flex-wrap gap-1.5 mb-4 text-[11px]">
                    <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200 font-mono">
                      Transport: {(cam.rtsp_transport || 'tcp').toUpperCase()}
                    </span>
                    <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
                      Segment: {(cam.segment_duration || 300) / 60}m
                    </span>
                    <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
                      Codec: {cam.video_codec === 'copy' ? 'Copy (0% CPU)' : cam.video_codec}
                    </span>
                    {cam.audio_mode === 'disabled' && (
                      <span className="bg-red-50 text-red-600 px-2 py-0.5 rounded border border-red-200">
                        Mute Audio
                      </span>
                    )}
                    {cam.extra_args && (
                      <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded border border-blue-200 font-mono" title={cam.extra_args}>
                        Custom FFmpeg
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 text-xs text-slate-400 flex justify-between">
                  <span>ID: #{cam.id}</span>
                  <span>{new Date(cam.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Camera Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl overflow-hidden shadow-xl max-h-[90vh] flex flex-col">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h2 className="text-xl font-bold text-slate-800">
                  {editingCameraId ? 'Chỉnh sửa Camera' : 'Thêm Camera Mới'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">Tùy chỉnh luồng RTSP và cấu hình FFmpeg ghi hình</p>
              </div>

              {/* Tabs */}
              <div className="flex bg-slate-200 p-1 rounded-xl gap-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('general')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    activeTab === 'general' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Cơ bản & Hãng
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('rtsp')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    activeTab === 'rtsp' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Tùy chọn RTSP
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('ffmpeg')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    activeTab === 'ffmpeg' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  FFmpeg & Ghi hình
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveCamera} className="flex-1 overflow-y-auto p-6 flex flex-col">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2.5 rounded-xl mb-5 text-sm font-medium">
                  {error}
                </div>
              )}

              {/* TAB 1: GENERAL & BRAND PRESET */}
              {activeTab === 'general' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Tên Camera</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="input-field w-full"
                      placeholder="vd: Cổng chính, Sân sau, Phòng khách..."
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Hãng Camera (Brand Preset)</label>
                    <select
                      value={brand}
                      onChange={(e) => handleBrandChange(e.target.value)}
                      className="input-field w-full"
                    >
                      {BRAND_PRESETS.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Friendly URL Builder or Manual Input Toggle */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        {isManualUrl ? 'Nhập Trực Tiếp RTSP URL' : `Bộ Tạo URL Chuẩn Cho ${getBrandName(brand)}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsManualUrl(!isManualUrl)}
                        className="text-xs text-orange-600 hover:text-orange-700 font-medium underline"
                      >
                        {isManualUrl ? '← Dùng bộ tạo theo thông số' : 'Chỉnh sửa URL trực tiếp →'}
                      </button>
                    </div>

                    {!isManualUrl ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Địa chỉ IP / Host</label>
                          <input
                            type="text"
                            value={builderIp}
                            onChange={(e) => setBuilderIp(e.target.value)}
                            className="input-field w-full text-sm"
                            placeholder="192.168.1.100"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Cổng RTSP (Port)</label>
                          <input
                            type="number"
                            value={builderPort}
                            onChange={(e) => {
                              const p = Number(e.target.value);
                              setBuilderPort(p);
                              setRtspPort(p);
                            }}
                            className="input-field w-full text-sm"
                            placeholder="554"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Tài khoản (Username)</label>
                          <input
                            type="text"
                            value={builderUser}
                            onChange={(e) => setBuilderUser(e.target.value)}
                            className="input-field w-full text-sm"
                            placeholder="admin"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Mật khẩu (Password)</label>
                          <input
                            type="password"
                            value={builderPass}
                            onChange={(e) => setBuilderPass(e.target.value)}
                            className="input-field w-full text-sm"
                            placeholder="••••••••"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Kênh (Channel)</label>
                          <input
                            type="number"
                            min="1"
                            max="64"
                            value={builderChannel}
                            onChange={(e) => setBuilderChannel(Number(e.target.value) || 1)}
                            className="input-field w-full text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Loại luồng (Stream Type)</label>
                          <select
                            value={builderIsSub ? 'sub' : 'main'}
                            onChange={(e) => setBuilderIsSub(e.target.value === 'sub')}
                            className="input-field w-full text-sm"
                          >
                            <option value="main">Main Stream (Độ nét cao - Khuyên dùng)</option>
                            <option value="sub">Sub Stream (Độ nét phụ / mượt hơn)</option>
                          </select>
                        </div>
                      </div>
                    ) : null}

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">RTSP URL Hoàn Chỉnh</label>
                      <input
                        type="text"
                        value={host}
                        onChange={(e) => setHost(e.target.value)}
                        readOnly={!isManualUrl}
                        className={`input-field w-full font-mono text-xs ${!isManualUrl ? 'bg-slate-100 text-slate-600 cursor-not-allowed' : ''}`}
                        placeholder="rtsp://admin:pass@192.168.1.100:554/stream"
                        required
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: RTSP OPTIONS */}
              {activeTab === 'rtsp' && (
                <div className="space-y-4">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Giao thức truyền tải (RTSP Transport)</label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {[
                        { id: 'tcp', label: 'TCP (Khuyên dùng)', desc: 'Chống mất gói tin, video ổn định không bị vỡ hạt.' },
                        { id: 'udp', label: 'UDP', desc: 'Độ trễ thấp hơn nhưng có thể bị rách khung hình khi mạng yếu.' },
                        { id: 'auto', label: 'Auto', desc: 'Tự động đàm phán giữa camera và server.' }
                      ].map((t) => (
                        <div
                          key={t.id}
                          onClick={() => setRtspTransport(t.id)}
                          className={`p-3 rounded-xl border cursor-pointer transition-all ${
                            rtspTransport === t.id
                              ? 'border-orange-500 bg-orange-50/50 text-orange-950 ring-1 ring-orange-500'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between font-semibold text-sm mb-1">
                            {t.label}
                            {rtspTransport === t.id && <Check size={16} className="text-orange-600" />}
                          </div>
                          <p className="text-xs text-slate-500 leading-relaxed">{t.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Cổng RTSP Mặc Định</label>
                    <input
                      type="number"
                      value={rtspPort}
                      onChange={(e) => setRtspPort(Number(e.target.value) || 554)}
                      className="input-field w-full"
                      placeholder="554"
                    />
                    <p className="text-xs text-slate-400 mt-1">Thông thường cổng mặc định của camera là 554 hoặc 8554.</p>
                  </div>
                </div>
              )}

              {/* TAB 3: FFMPEG & RECORDING */}
              {activeTab === 'ffmpeg' && (
                <div className="space-y-4">
                  {/* Segment Duration */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Độ dài mỗi tệp video ghi hình</label>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {[
                        { secs: 60, label: '1 Phút' },
                        { secs: 300, label: '5 Phút (Chuẩn)' },
                        { secs: 600, label: '10 Phút' },
                        { secs: 900, label: '15 Phút' },
                        { secs: 1800, label: '30 Phút' }
                      ].map((item) => (
                        <button
                          key={item.secs}
                          type="button"
                          onClick={() => setSegmentDuration(item.secs)}
                          className={`py-2 px-3 rounded-lg text-xs font-medium border transition-all ${
                            segmentDuration === item.secs
                              ? 'bg-orange-600 text-white border-orange-600 shadow-sm'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Video & Audio Codec */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Chế độ xử lý Video</label>
                      <select
                        value={videoCodec}
                        onChange={(e) => setVideoCodec(e.target.value)}
                        className="input-field w-full"
                      >
                        <option value="copy">Direct Stream Copy (0% CPU - Khuyên dùng)</option>
                        <option value="h264">Re-encode H.264 (libx264)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Xử lý Âm thanh (Audio)</label>
                      <select
                        value={audioMode}
                        onChange={(e) => setAudioMode(e.target.value)}
                        className="input-field w-full"
                      >
                        <option value="copy">Copy Audio (Giữ nguyên âm thanh gốc)</option>
                        <option value="aac">Encode AAC</option>
                        <option value="disabled">Mute / Tắt ghi âm (-an)</option>
                      </select>
                    </div>
                  </div>

                  {/* Quick FFmpeg presets add */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      Thêm nhanh tùy chọn FFmpeg (Bấm để thêm)
                    </label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {FFMPEG_PRESET_TAGS.map((tag) => (
                        <button
                          key={tag.label}
                          type="button"
                          onClick={() => handleAddFfmpegTag(tag.value)}
                          className="text-xs bg-slate-100 hover:bg-orange-50 hover:text-orange-600 hover:border-orange-200 text-slate-700 px-2.5 py-1 rounded-lg border border-slate-200 transition-all"
                          title={tag.desc}
                        >
                          + {tag.label}
                        </button>
                      ))}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Tham số FFmpeg Tùy Chỉnh (Extra Arguments)</label>
                      <input
                        type="text"
                        value={extraArgs}
                        onChange={(e) => setExtraArgs(e.target.value)}
                        className="input-field w-full font-mono text-xs"
                        placeholder="vd: -fflags nobuffer -loglevel warning"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">Các cờ lệnh này sẽ được chèn trực tiếp vào lệnh FFmpeg trước tệp đầu ra.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Modal Footer */}
              <div className="mt-auto pt-6 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  className="btn btn-secondary px-6"
                  onClick={() => setShowModal(false)}
                  disabled={isSubmitting}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="btn btn-primary px-6 shadow-sm"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Đang lưu...' : (editingCameraId ? 'Cập Nhật Camera' : 'Lưu Camera')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Cameras;
