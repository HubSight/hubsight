import React from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { CameraType } from '../../types/camera';
import { BRAND_PRESETS } from '../../constants/cameraPresets';

interface CameraCardProps {
  camera: CameraType;
  onEdit: (camera: CameraType) => void;
  onDelete: (id: number) => void;
}

export const CameraCard: React.FC<CameraCardProps> = ({ camera, onEdit, onDelete }) => {
  const camPreset = BRAND_PRESETS.find((b) => b.id === camera.brand);

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 hover:border-slate-300 transition-all shadow-sm flex flex-col justify-between">
      <div>
        <div className="flex justify-between items-start mb-3 gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`w-3 h-3 rounded-full shrink-0 ${
                camera.is_active ? 'bg-green-500 shadow-sm' : 'bg-red-500'
              }`}
            />
            <div className="min-w-0">
              <h3 className="font-bold text-base sm:text-lg text-slate-800 truncate">{camera.name}</h3>
              <span className="inline-block px-2 py-0.5 bg-orange-50 text-orange-600 rounded text-[11px] font-semibold border border-orange-200">
                {camPreset ? camPreset.name : camera.brand || 'Generic'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onEdit(camera)}
              className="text-slate-400 hover:text-orange-600 active:text-orange-700 transition-colors w-9 h-9 rounded-xl hover:bg-orange-50 active:bg-orange-100 flex items-center justify-center cursor-pointer touch-manipulation"
              title="Edit camera"
              aria-label="Edit camera"
            >
              <Pencil size={17} />
            </button>
            <button
              onClick={() => onDelete(camera.id)}
              className="text-slate-400 hover:text-red-600 active:text-red-700 transition-colors w-9 h-9 rounded-xl hover:bg-red-50 active:bg-red-100 flex items-center justify-center cursor-pointer touch-manipulation"
              title="Delete camera"
              aria-label="Delete camera"
            >
              <Trash2 size={17} />
            </button>
          </div>
        </div>

        <div className="text-xs text-slate-600 font-mono bg-slate-50 border border-slate-200 p-2.5 rounded-lg break-all mb-3">
          {camera.host}
        </div>

        <div className="flex flex-wrap gap-1.5 mb-4 text-[11px]">
          <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200 font-mono">
            Transport: {(camera.rtsp_transport || 'tcp').toUpperCase()}
          </span>
          <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
            Segment: {(camera.segment_duration || 300) / 60}m
          </span>
          <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
            Codec: {camera.video_codec === 'copy' ? 'Copy (0% CPU)' : camera.video_codec}
          </span>
          {camera.audio_mode === 'disabled' ? (
            <span className="bg-red-50 text-red-600 px-2 py-0.5 rounded border border-red-200">
              Mute Audio
            </span>
          ) : (
            <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200">
              Audio: {camera.audio_mode === 'auto' ? 'Auto Detect' : camera.audio_mode}
            </span>
          )}
          {camera.extra_args && (
            <span
              className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded border border-blue-200 font-mono"
              title={camera.extra_args}
            >
              Custom FFmpeg
            </span>
          )}
        </div>
      </div>

      <div className="pt-3 border-t border-slate-100 text-xs text-slate-400 flex justify-between">
        <span>ID: #{camera.id}</span>
        <span>{new Date(camera.created_at).toLocaleDateString()}</span>
      </div>
    </div>
  );
};
