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
  const observerTarget = useRef<HTMLDivElement>(null);

  const [faces, setFaces] = useState<FaceItem[]>([]);
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);

  // Pagination & Sorting state
  const [totalFaces, setTotalFaces] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingFaces, setIsLoadingFaces] = useState(false);
  const [sortBy, setSortBy] = useState<'created_at' | 'quality_score'>('created_at');

  // Batch action state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedFaceIds, setSelectedFaceIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchFaces = async (pageNum: number, sort: string, append = false) => {
    if (!member) return;
    try {
      setIsLoadingFaces(true);
      const res = await axiosClient.get(`/members/${member.id}/faces`, {
        params: { page: pageNum, limit: 20, sort_by: sort, order: 'desc' },
      });
      const data = res.data;
      if (append) {
        setFaces((prev) => {
          // Avoid duplicates
          const newFaces = data.data.filter((newF: FaceItem) => !prev.some(p => p.id === newF.id));
          return [...prev, ...newFaces];
        });
      } else {
        setFaces(data.data);
      }
      setTotalFaces(data.total);
      setHasMore(pageNum < data.total_pages);
    } catch (err: any) {
      console.error(err);
      setError('Failed to load faces');
    } finally {
      setIsLoadingFaces(false);
    }
  };

  // Sync state when member changes
  useEffect(() => {
    if (isOpen && member) {
      setCurrentAvatarUrl(member.avatar_url || '');
      setError('');
      setSelectedPhotoIndex(null);
      setSelectionMode(false);
      setSelectedFaceIds(new Set());
      setPage(1);
      fetchFaces(1, sortBy, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, member, sortBy]);

  // Handle ESC to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isUploading && !isDeleting) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isUploading, isDeleting, onClose]);

  // Infinite Scroll Observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingFaces) {
          const nextPage = page + 1;
          setPage(nextPage);
          fetchFaces(nextPage, sortBy, true);
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [hasMore, isLoadingFaces, page, sortBy, member]);

  if (!isOpen || !member) return null;

  const handleMultipleFilesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      setIsUploading(true);
      setError('');
      setUploadProgress({ current: 0, total: files.length });

      let addedCount = 0;

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
          addedCount++;
          // If no avatar yet, auto-set first face photo as avatar
          if (!currentAvatarUrl && i === 0) {
            setCurrentAvatarUrl(s3PresignedUrl);
            await axiosClient.put(`/members/${member.id}`, { avatar_url: s3PresignedUrl });
          }
        }
      }

      if (addedCount > 0) {
        setPage(1);
        await fetchFaces(1, sortBy, false);
        onUpdate();
      }
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
      setTotalFaces((prev) => prev - 1);
      if (selectedPhotoIndex !== null) setSelectedPhotoIndex(null);
      onUpdate();
    } catch (err: any) {
      console.error('Failed to delete face:', err);
      setError(err?.response?.data?.error || t('common.errorOccurred'));
    }
  };

  const handleBatchDelete = async () => {
    if (selectedFaceIds.size === 0) return;
    if (!window.confirm(`Xoá ${selectedFaceIds.size} ảnh đã chọn?`)) return;

    try {
      setIsDeleting(true);
      await axiosClient.delete(`/members/${member.id}/faces`, {
        data: { face_ids: Array.from(selectedFaceIds) },
      });

      setSelectedFaceIds(new Set());
      setSelectionMode(false);
      setPage(1);
      await fetchFaces(1, sortBy, false);
      onUpdate();
    } catch (err: any) {
      console.error(err);
      setError('Lỗi khi xoá nhiều ảnh.');
    } finally {
      setIsDeleting(false);
    }
  };

  const selectedFace = selectedPhotoIndex !== null ? faces[selectedPhotoIndex] : null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center animate-in fade-in duration-200">
      <div className="bg-white w-full h-full overflow-hidden flex flex-col">
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
                  {totalFaces} {t('members.faceSamplesCount')}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isUploading || isDeleting}
              className="p-3 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <X size={28} />
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
          disabled={isUploading || isDeleting}
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
          </div>

          {/* Upload Dropzone Bar */}
          <div
            onClick={() => {
              if (!isUploading && !isDeleting) fileInputRef.current?.click();
            }}
            className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center gap-2 transition-all group ${
              isUploading || isDeleting
                ? 'border-slate-200 bg-slate-50/50 cursor-not-allowed opacity-60'
                : 'border-slate-300 hover:border-orange-500 bg-white hover:bg-orange-50/20 cursor-pointer'
            }`}
          >
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
              isUploading || isDeleting ? 'bg-slate-100 text-slate-400' : 'bg-slate-50 group-hover:bg-orange-100 text-slate-400 group-hover:text-orange-600 group-hover:scale-105'
            }`}>
              {isUploading ? (
                <div className="w-6 h-6 border-2 border-orange-600 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Upload size={22} />
              )}
            </div>
            <div className={`text-xs font-bold text-center ${isUploading || isDeleting ? 'text-slate-500' : 'text-slate-700 group-hover:text-orange-600'}`}>
              {isUploading
                ? `${t('gallery.uploadingProgress')} (${uploadProgress?.current}/${uploadProgress?.total})`
                : t('gallery.uploadPhotos')}
            </div>
            <p className="text-[11px] text-slate-400 text-center max-w-md">
              {t('gallery.uploadMultipleHint')}
            </p>
          </div>

          {/* Photo Gallery Area */}
          <div>
            {/* Action Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 px-1">
              <div className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Layers size={14} className="text-slate-400" />
                {t('members.tabFaces')} ({totalFaces})
              </div>

              <div className="flex items-center gap-2">
                {!selectionMode ? (
                  <>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as any)}
                      className="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 outline-none focus:border-orange-500 cursor-pointer"
                    >
                      <option value="created_at">Mới nhất</option>
                      <option value="quality_score">Điểm chất lượng (Cao xuống thấp)</option>
                    </select>
                    <button
                      onClick={() => setSelectionMode(true)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                      Chọn nhiều
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        if (selectedFaceIds.size === faces.length) {
                          setSelectedFaceIds(new Set());
                        } else {
                          setSelectedFaceIds(new Set(faces.map((f) => f.id)));
                        }
                      }}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                      {selectedFaceIds.size === faces.length ? 'Bỏ chọn hết' : 'Chọn tất cả trang này'}
                    </button>
                    <button
                      onClick={() => {
                        setSelectionMode(false);
                        setSelectedFaceIds(new Set());
                      }}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                      Huỷ
                    </button>
                    <button
                      onClick={handleBatchDelete}
                      disabled={selectedFaceIds.size === 0 || isDeleting}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                    >
                      {isDeleting ? 'Đang xoá...' : `Xoá ${selectedFaceIds.size} mục`}
                    </button>
                  </>
                )}
              </div>
            </div>

            {faces.length > 0 ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
                  {faces.map((f, idx) => {
                    const isAvatar = currentAvatarUrl === f.sample_image_url;
                    const qualityPercent = Math.round((f.quality_score || 0.88) * 100);
                    const isSelected = selectedFaceIds.has(f.id);

                    return (
                      <div
                        key={f.id}
                        className={`group relative bg-white rounded-2xl overflow-hidden border shadow-xs transition-all flex flex-col aspect-square hover:shadow-md ${
                          isAvatar ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-slate-200'
                        } ${isSelected ? 'ring-2 ring-orange-500 border-orange-500' : ''}`}
                      >
                        {/* Image */}
                        <img
                          src={f.sample_image_url}
                          alt="Face vector sample"
                          loading="lazy"
                          onClick={() => {
                            if (selectionMode) {
                              const newSet = new Set(selectedFaceIds);
                              if (newSet.has(f.id)) newSet.delete(f.id);
                              else newSet.add(f.id);
                              setSelectedFaceIds(newSet);
                            } else {
                              setSelectedPhotoIndex(idx);
                            }
                          }}
                          className={`w-full h-full object-cover transition-transform duration-300 ${
                            selectionMode ? 'cursor-pointer hover:opacity-80' : 'group-hover:scale-105 cursor-pointer'
                          } ${isSelected ? 'scale-90 opacity-80 rounded-xl' : ''}`}
                        />

                        {/* Selection Checkmark */}
                        {selectionMode && (
                          <div className="absolute top-2 right-2 z-10 pointer-events-none">
                            <div
                              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                                isSelected
                                  ? 'bg-orange-500 border-orange-500 text-white'
                                  : 'border-white/80 bg-black/20'
                              }`}
                            >
                              {isSelected && <CheckCircle2 size={12} />}
                            </div>
                          </div>
                        )}

                        {/* Top Quality Badge */}
                        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-lg bg-slate-900/80 text-white font-mono text-[10px] backdrop-blur-xs flex items-center gap-1 pointer-events-none">
                          <CheckCircle2
                            size={10}
                            className={qualityPercent >= 90 ? 'text-emerald-400' : 'text-amber-400'}
                          />
                          {qualityPercent}%
                        </div>

                        {/* Top Right: Delete Button */}
                        {!selectionMode && (
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
                        )}

                        {/* Avatar Star / Badge */}
                        {isAvatar ? (
                          <div className="absolute bottom-2 left-2 right-2 py-1 px-2 rounded-xl bg-emerald-600/90 backdrop-blur-xs text-white text-[10px] font-bold flex items-center justify-center gap-1 shadow-sm pointer-events-none">
                            <Star size={11} className="fill-current" />
                            <span>{t('gallery.currentAvatar')}</span>
                          </div>
                        ) : (
                          !selectionMode && (
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
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedPhotoIndex(idx);
                                }}
                                className="p-1 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-white shadow-sm cursor-pointer"
                                title={t('gallery.previewPhoto')}
                              >
                                <Maximize2 size={12} />
                              </button>
                            </div>
                          )
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Loading More / Intersection Target */}
                <div
                  ref={observerTarget}
                  className="w-full h-14 flex items-center justify-center text-xs text-slate-400 mt-4"
                >
                  {isLoadingFaces && (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-orange-600 border-t-transparent rounded-full animate-spin" />
                      <span>Đang tải thêm...</span>
                    </div>
                  )}
                  {!hasMore && faces.length > 0 && <span>Đã tải hết {totalFaces} ảnh.</span>}
                </div>
              </>
            ) : (
              !isLoadingFaces && (
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
                </div>
              )
            )}
            
            {isLoadingFaces && faces.length === 0 && (
              <div className="flex justify-center p-10">
                <div className="w-6 h-6 border-2 border-orange-600 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/70 text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-2 font-medium">
            <Sparkles size={13} className="text-orange-500" />
            <span>{t('gallery.vectorCount')}: {totalFaces * 512} floats</span>
          </div>
        </div>
      </div>

      {/* Lightbox Modal */}
      {selectedFace && (
        <div className="fixed inset-0 bg-black/90 z-[110] flex flex-col items-center justify-center p-4 animate-in fade-in duration-150">
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
