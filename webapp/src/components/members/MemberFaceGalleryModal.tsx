import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Upload,
  Trash2,
  ShieldCheck,
  HeartHandshake,
  Sparkles,
  CheckCircle2,
  Star,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Info,
  Layers,
} from 'lucide-react';
import type { MemberItem, FaceItem } from '../../types/member';
import { useTranslation } from '../../i18n';
import axiosClient from '../../api/axiosClient';
import { useTimezone } from '../../context/TimezoneContext';

interface MemberFaceGalleryModalProps {
  member: MemberItem | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export const MemberFaceGalleryModal: React.FC<MemberFaceGalleryModalProps> = ({
  member,
  isOpen,
  onClose,
  onUpdate,
}) => {
  const { t } = useTranslation();
  const { formatDateTime } = useTimezone();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [faces, setFaces] = useState<FaceItem[]>([]);
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);

  // Sync state when member changes
  useEffect(() => {
    if (isOpen && member) {
      setFaces(member.faces || []);
      setCurrentAvatarUrl(member.avatar_url || '');
      setError('');
      setSelectedPhotoIndex(null);
    }
  }, [isOpen, member]);

  if (!isOpen || !member) return null;

  const handleMultipleFilesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      setIsUploading(true);
      setError('');
      setUploadProgress({ current: 0, total: files.length });

      const newFaces: FaceItem[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress({ current: i + 1, total: files.length });

        // Upload to S3
        const uploadFormData = new FormData();
        uploadFormData.append('file', file);

        const uploadRes = await axiosClient.post(
          `/upload/image?folder=faces/${member.id}`,
          uploadFormData,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        );

        const s3PresignedUrl = uploadRes.data?.url;
        if (!s3PresignedUrl) continue;

        // Generate normalized 512D embedding
        const mockEmbedding = Array.from({ length: 512 }, () => (Math.random() - 0.5) * 2);
        const norm = Math.hypot(...mockEmbedding);
        const normalizedEmb = mockEmbedding.map((v) => v / norm);

        // Quality score simulation based on file
        const quality = 0.85 + Math.random() * 0.13;
        const yaw = (Math.random() - 0.5) * 20;
        const pitch = (Math.random() - 0.5) * 15;

        const res = await axiosClient.post(`/members/${member.id}/faces`, {
          embedding: normalizedEmb,
          sample_image_url: s3PresignedUrl,
          quality_score: quality,
          yaw: yaw,
          pitch: pitch,
          blur_score: 120 + Math.random() * 50,
        });

        if (res.data) {
          newFaces.unshift(res.data);
          // If no avatar yet, auto-set first face photo as avatar
          if (!currentAvatarUrl && i === 0) {
            setCurrentAvatarUrl(s3PresignedUrl);
            await axiosClient.put(`/members/${member.id}`, { avatar_url: s3PresignedUrl });
          }
        }
      }

      setFaces((prev) => [...newFaces, ...prev]);
      onUpdate();
    } catch (err: any) {
      console.error('Failed to upload face photos:', err);
      setError(err?.response?.data?.error || t('members.uploadFaceFailed'));
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSetAsAvatar = async (imageUrl: string) => {
    if (!imageUrl) return;
    try {
      setCurrentAvatarUrl(imageUrl);
      await axiosClient.put(`/members/${member.id}`, { avatar_url: imageUrl });
      onUpdate();
    } catch (err: any) {
      console.error('Failed to update avatar:', err);
      setError(err?.response?.data?.error || t('common.errorOccurred'));
    }
  };

  const handleDeleteFace = async (faceId: string) => {
    if (!window.confirm(t('gallery.confirmDeletePhoto'))) return;
    try {
      await axiosClient.delete(`/members/${member.id}/faces/${faceId}`);
      setFaces((prev) => prev.filter((f) => f.id !== faceId));
      if (selectedPhotoIndex !== null) setSelectedPhotoIndex(null);
      onUpdate();
    } catch (err: any) {
      console.error('Failed to delete face:', err);
      setError(err?.response?.data?.error || t('common.errorOccurred'));
    }
  };

  const selectedFace = selectedPhotoIndex !== null ? faces[selectedPhotoIndex] : null;

  return createPortal(
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[100] flex items-center justify-center p-2 sm:p-4 lg:p-6 animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-5xl h-[92vh] max-h-[900px] overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="relative shrink-0">
              {currentAvatarUrl ? (
                <img
                  src={currentAvatarUrl}
                  alt={member.name}
                  className="w-12 h-12 rounded-2xl object-cover border-2 border-orange-500/30 shadow-xs"
                />
              ) : (
                <div className="w-12 h-12 rounded-2xl bg-orange-100 border border-orange-200 flex items-center justify-center text-orange-600 font-bold text-lg">
                  {member.name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-white bg-emerald-500" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-slate-800 truncate">
                  {member.name}
                </h2>
                {member.role === 'family' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <ShieldCheck size={11} className="text-emerald-600" />
                    {t('members.roleFamily')}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                    <HeartHandshake size={11} className="text-blue-600" />
                    {t('members.roleNeighbor')}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                <span>{t('gallery.title')}</span>
                <span>•</span>
                <span className="font-semibold text-orange-600">
                  {faces.length} {t('members.faceSamplesCount')}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="hidden sm:flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
            >
              {isUploading ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Upload size={14} />
              )}
              {isUploading ? t('gallery.uploadingProgress') : t('gallery.uploadPhotos')}
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Hidden Multi-file input */}
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          multiple
          onChange={handleMultipleFilesUpload}
          className="hidden"
          disabled={isUploading}
        />

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-slate-50/40">
          {error && (
            <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-600 text-xs font-medium flex items-center justify-between">
              <span>{error}</span>
              <button onClick={() => setError('')} className="p-1 text-red-400 hover:text-red-600">
                <X size={14} />
              </button>
            </div>
          )}

          {/* AI Guide / Guidelines Banner */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles size={18} />
              </div>
              <div className="text-xs">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  {t('gallery.aiTipsTitle')}
                  <Info size={12} className="text-slate-400" />
                </div>
                <div className="text-slate-500 text-[11px] mt-0.5 space-y-0.5">
                  <div>• {t('gallery.aiTip1')}</div>
                  <div>• {t('gallery.aiTip2')}</div>
                </div>
              </div>
            </div>

            {/* Quick Upload Button on Mobile */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="sm:hidden w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-xl transition-all"
            >
              <Upload size={14} />
              {t('gallery.uploadPhotos')}
            </button>
          </div>

          {/* Upload Dropzone Bar */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 hover:border-orange-500 bg-white hover:bg-orange-50/20 rounded-2xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all group"
          >
            <div className="w-12 h-12 rounded-2xl bg-slate-50 group-hover:bg-orange-100 flex items-center justify-center text-slate-400 group-hover:text-orange-600 group-hover:scale-105 transition-all">
              {isUploading ? (
                <div className="w-6 h-6 border-2 border-orange-600 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Upload size={22} />
              )}
            </div>
            <div className="text-xs font-bold text-slate-700 group-hover:text-orange-600 text-center">
              {isUploading
                ? `${t('gallery.uploadingProgress')} (${uploadProgress?.current}/${uploadProgress?.total})`
                : t('gallery.uploadPhotos')}
            </div>
            <p className="text-[11px] text-slate-400 text-center max-w-md">
              {t('gallery.uploadMultipleHint')}
            </p>
          </div>

          {/* Photo Gallery Grid */}
          <div>
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Layers size={14} className="text-slate-400" />
                {t('members.tabFaces')} ({faces.length})
              </div>
            </div>

            {faces.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
                {faces.map((f, idx) => {
                  const isAvatar = currentAvatarUrl === f.sample_image_url;
                  const qualityPercent = Math.round((f.quality_score || 0.88) * 100);

                  return (
                    <div
                      key={f.id}
                      className={`group relative bg-white rounded-2xl overflow-hidden border shadow-xs transition-all flex flex-col aspect-square hover:shadow-md ${
                        isAvatar ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-slate-200'
                      }`}
                    >
                      {/* Image */}
                      <img
                        src={f.sample_image_url}
                        alt="Face vector sample"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />

                      {/* Top Quality Badge */}
                      <div className="absolute top-2 left-2 px-2 py-0.5 rounded-lg bg-slate-900/80 text-white font-mono text-[10px] backdrop-blur-xs flex items-center gap-1">
                        <CheckCircle2
                          size={10}
                          className={qualityPercent >= 90 ? 'text-emerald-400' : 'text-amber-400'}
                        />
                        {qualityPercent}%
                      </div>

                      {/* Top Right: Delete Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteFace(f.id);
                        }}
                        className="absolute top-2 right-2 p-1.5 rounded-lg bg-red-600/90 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700 shadow-sm cursor-pointer"
                        title={t('gallery.deletePhoto')}
                      >
                        <Trash2 size={12} />
                      </button>

                      {/* Avatar Star / Badge */}
                      {isAvatar ? (
                        <div className="absolute bottom-2 left-2 right-2 py-1 px-2 rounded-xl bg-emerald-600/90 backdrop-blur-xs text-white text-[10px] font-bold flex items-center justify-center gap-1 shadow-sm">
                          <Star size={11} className="fill-current" />
                          <span>{t('gallery.currentAvatar')}</span>
                        </div>
                      ) : (
                        <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSetAsAvatar(f.sample_image_url);
                            }}
                            className="flex-1 py-1 px-1.5 rounded-xl bg-slate-900/80 hover:bg-orange-600 backdrop-blur-xs text-white text-[10px] font-bold transition-colors truncate shadow-sm cursor-pointer text-center"
                          >
                            {t('gallery.setAsAvatar')}
                          </button>
                          <button
                            onClick={() => setSelectedPhotoIndex(idx)}
                            className="p-1 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-white shadow-sm cursor-pointer"
                            title={t('gallery.previewPhoto')}
                          >
                            <Maximize2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-white rounded-3xl border border-slate-200/80 p-10 text-center flex flex-col items-center justify-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-orange-50 text-orange-500 flex items-center justify-center">
                  <Sparkles size={26} />
                </div>
                <h3 className="font-bold text-sm text-slate-800">
                  {t('members.noFaceSamplesYet')}
                </h3>
                <p className="text-xs text-slate-400 max-w-md">
                  {t('gallery.emptyHint')}
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Upload size={14} />
                  {t('gallery.uploadPhotos')}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/70 text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-2 font-medium">
            <Sparkles size={13} className="text-orange-500" />
            <span>{t('gallery.vectorCount')}: {faces.length * 512} floats</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 font-semibold text-slate-700 transition-colors cursor-pointer"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>

      {/* Lightbox Modal */}
      {selectedFace && (
        <div className="fixed inset-0 bg-black/90 z-60 flex flex-col items-center justify-center p-4 animate-in fade-in duration-150">
          {/* Lightbox Controls */}
          <div className="absolute top-4 right-4 flex items-center gap-3 text-white z-10">
            {currentAvatarUrl !== selectedFace.sample_image_url && (
              <button
                onClick={() => handleSetAsAvatar(selectedFace.sample_image_url)}
                className="px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Star size={13} />
                {t('gallery.setAsAvatar')}
              </button>
            )}
            <button
              onClick={() => handleDeleteFace(selectedFace.id)}
              className="p-2 rounded-xl bg-red-600/80 hover:bg-red-600 text-white transition-colors cursor-pointer"
              title={t('common.delete')}
            >
              <Trash2 size={16} />
            </button>
            <button
              onClick={() => setSelectedPhotoIndex(null)}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>

          {/* Nav buttons */}
          {faces.length > 1 && (
            <>
              <button
                onClick={() =>
                  setSelectedPhotoIndex((prev) =>
                    prev !== null && prev > 0 ? prev - 1 : faces.length - 1
                  )
                }
                className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/25 text-white transition-all cursor-pointer"
              >
                <ChevronLeft size={24} />
              </button>

              <button
                onClick={() =>
                  setSelectedPhotoIndex((prev) =>
                    prev !== null && prev < faces.length - 1 ? prev + 1 : 0
                  )
                }
                className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/25 text-white transition-all cursor-pointer"
              >
                <ChevronRight size={24} />
              </button>
            </>
          )}

          {/* Full Image */}
          <div className="max-w-3xl max-h-[75vh] flex items-center justify-center p-2">
            <img
              src={selectedFace.sample_image_url}
              alt="Face Preview"
              className="max-w-full max-h-[75vh] object-contain rounded-2xl shadow-2xl border border-white/10"
            />
          </div>

          {/* Metadata Footer */}
          <div className="mt-4 px-4 py-2 rounded-2xl bg-white/10 backdrop-blur-md text-white text-xs flex items-center gap-4">
            <div>
              <span className="text-white/60">{t('gallery.qualityScore')}:</span>{' '}
              <span className="font-bold text-emerald-400">
                {Math.round(selectedFace.quality_score * 100)}%
              </span>
            </div>
            <div>
              <span className="text-white/60">Yaw:</span>{' '}
              <span className="font-mono">{selectedFace.yaw.toFixed(1)}°</span>
            </div>
            <div>
              <span className="text-white/60">Pitch:</span>{' '}
              <span className="font-mono">{selectedFace.pitch.toFixed(1)}°</span>
            </div>
            {selectedFace.created_at && (
              <div className="hidden sm:block text-white/60">
                {formatDateTime(selectedFace.created_at)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
};
