import React, { useState } from 'react';
import { Layers, Globe, Sliders } from 'lucide-react';
import type { CameraFormData } from '../../types/camera';
import { CameraGeneralTab } from './CameraGeneralTab';
import { CameraRtspTab } from './CameraRtspTab';
import { CameraFfmpegTab } from './CameraFfmpegTab';

interface CameraModalProps {
  isEditing: boolean;
  formData: CameraFormData;
  error: string;
  isSubmitting: boolean;
  onClose: () => void;
  onChange: (patch: Partial<CameraFormData>) => void;
  onSubmit: (e: React.FormEvent) => void;
  onAddFfmpegTag: (tag: string) => void;
}

export const CameraModal: React.FC<CameraModalProps> = ({
  isEditing,
  formData,
  error,
  isSubmitting,
  onClose,
  onChange,
  onSubmit,
  onAddFfmpegTag
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'rtsp' | 'ffmpeg'>('general');

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 md:p-6">
      <div className="bg-white border border-slate-200/90 rounded-2xl sm:rounded-3xl w-full max-w-3xl lg:max-w-4xl overflow-hidden shadow-2xl max-h-[92dvh] flex flex-col">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 md:p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 bg-slate-50/70">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-800">
              {isEditing ? 'Edit Camera' : 'Add New Camera'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Customize RTSP and FFmpeg recording options
            </p>
          </div>

          {/* Tabs */}
          <div className="flex bg-slate-200/80 p-1 rounded-xl gap-1 w-full sm:w-auto overflow-x-auto custom-scrollbar shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('general')}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'general'
                  ? 'bg-white text-orange-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers size={14} />
              General
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('rtsp')}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'rtsp'
                  ? 'bg-white text-orange-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Globe size={14} />
              RTSP Options
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('ffmpeg')}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'ffmpeg'
                  ? 'bg-white text-orange-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sliders size={14} />
              FFmpeg & Recording
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <form onSubmit={onSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 md:p-6 flex flex-col">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2.5 rounded-xl mb-4 text-xs sm:text-sm font-medium">
              {error}
            </div>
          )}

          {activeTab === 'general' && (
            <CameraGeneralTab formData={formData} onChange={onChange} />
          )}

          {activeTab === 'rtsp' && (
            <CameraRtspTab formData={formData} onChange={onChange} />
          )}

          {activeTab === 'ffmpeg' && (
            <CameraFfmpegTab
              formData={formData}
              onChange={onChange}
              onAddFfmpegTag={onAddFfmpegTag}
            />
          )}

          {/* Modal Footer */}
          <div className="mt-auto pt-5 border-t border-slate-100 flex flex-col-reverse sm:flex-row justify-end gap-2.5 sm:gap-3">
            <button
              type="button"
              className="btn btn-secondary w-full sm:w-auto px-6 py-2.5 text-sm font-semibold cursor-pointer"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary w-full sm:w-auto px-6 py-2.5 text-sm font-semibold shadow-sm cursor-pointer"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : isEditing ? 'Update Camera' : 'Save Camera'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
