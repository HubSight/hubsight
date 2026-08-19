import React from 'react';
import { Tv, Volume2 } from 'lucide-react';
import type { DeviceFormData } from '../../types/device';
import { FFMPEG_PRESET_TAGS } from '../../constants/devicePresets';

export interface DeviceFfmpegTabProps {
  formData: DeviceFormData;
  onChange: (patch: Partial<DeviceFormData>) => void;
  onAddFfmpegTag: (tag: string) => void;
}

const SEGMENT_DURATIONS = [
  { secs: 60, label: '1 Minute' },
  { secs: 300, label: '5 Minutes (Std)' },
  { secs: 600, label: '10 Minutes' },
  { secs: 900, label: '15 Minutes' },
  { secs: 1800, label: '30 Minutes' }
];

const VIDEO_CODECS = [
  {
    id: 'copy',
    title: 'Direct Stream Copy',
    badge: '0% CPU',
    desc: 'Preserves stream quality with zero server CPU re-encoding overhead.'
  },
  {
    id: 'h264',
    title: 'Re-encode H.264',
    badge: 'libx264',
    desc: 'Re-encodes video stream to standard H.264 for maximum device compatibility.'
  }
];

const AUDIO_MODES = [
  {
    id: 'auto',
    title: 'Auto Detect',
    badge: 'Recommended',
    desc: 'Automatically probes audio & transcodes PCM/G.711 to browser-compatible AAC.'
  },
  {
    id: 'copy',
    title: 'Direct Copy',
    badge: 'Direct Copy',
    desc: 'Preserves incoming raw audio stream directly from device without changes.'
  },
  {
    id: 'aac',
    title: 'Encode AAC',
    badge: 'Transcode',
    desc: 'Forces audio stream transcoding into standard AAC format.'
  },
  {
    id: 'disabled',
    title: 'Mute Audio',
    badge: 'Mute (-an)',
    desc: 'Disables audio track recording for privacy.'
  }
];

export const DeviceFfmpegTab: React.FC<DeviceFfmpegTabProps> = ({
  formData,
  onChange,
  onAddFfmpegTag
}) => {
  return (
    <div className="space-y-4">
      {/* Segment Duration */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Video Segment Duration
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {SEGMENT_DURATIONS.map((item) => (
            <button
              key={item.secs}
              type="button"
              onClick={() => onChange({ segmentDuration: item.secs })}
              className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                formData.segmentDuration === item.secs
                  ? 'bg-orange-600 text-white border-orange-600 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Video Codec Cards */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-1.5">
          <Tv size={16} className="text-orange-600" />
          Video Codec Mode
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {VIDEO_CODECS.map((vc) => (
            <div
              key={vc.id}
              onClick={() => onChange({ videoCodec: vc.id })}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                formData.videoCodec === vc.id
                  ? 'border-orange-500 bg-orange-50/50 ring-1 ring-orange-500 shadow-sm'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-sm text-slate-800">{vc.title}</span>
                <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-bold rounded">
                  {vc.badge}
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">{vc.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Audio Mode Cards */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-1.5">
          <Volume2 size={16} className="text-orange-600" />
          Audio Processing Mode
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {AUDIO_MODES.map((am) => (
            <div
              key={am.id}
              onClick={() => onChange({ audioMode: am.id })}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                formData.audioMode === am.id
                  ? 'border-orange-500 bg-orange-50/50 ring-1 ring-orange-500 shadow-sm'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-sm text-slate-800">{am.title}</span>
                <span
                  className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                    am.id === 'auto'
                      ? 'bg-orange-100 text-orange-700'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {am.badge}
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">{am.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Quick FFmpeg presets add */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Quick FFmpeg Options (Click to add)
        </label>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {FFMPEG_PRESET_TAGS.map((tag) => (
            <button
              key={tag.label}
              type="button"
              onClick={() => onAddFfmpegTag(tag.value)}
              className="text-xs bg-white hover:bg-orange-50 hover:text-orange-600 hover:border-orange-200 text-slate-700 px-2.5 py-1.5 rounded-lg border border-slate-200 transition-all font-medium cursor-pointer shadow-2xs"
              title={tag.desc}
            >
              + {tag.label}
            </button>
          ))}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Custom FFmpeg Arguments (Extra Arguments)
          </label>
          <input
            type="text"
            value={formData.extraArgs}
            onChange={(e) => onChange({ extraArgs: e.target.value })}
            className="input-field w-full font-mono text-xs bg-white"
            placeholder="e.g. -fflags nobuffer -loglevel warning"
          />
          <p className="text-[11px] text-slate-400 mt-1">
            These flags are inserted directly into the FFmpeg command before output.
          </p>
        </div>
      </div>
    </div>
  );
};

// Backward compatibility alias
export const CameraFfmpegTab = DeviceFfmpegTab;
export type CameraFfmpegTabProps = DeviceFfmpegTabProps;
