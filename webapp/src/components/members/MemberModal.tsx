import React, { useState } from 'react';
import { X, Upload, Trash2, ShieldCheck, HeartHandshake, Sparkles, CheckCircle2 } from 'lucide-react';
import type { MemberItem, MemberFormData, FaceItem } from '../../types/member';
import { useTranslation } from '../../i18n';
import axiosClient from '../../api/axiosClient';

interface MemberModalProps {
  member?: MemberItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const MemberModal: React.FC<MemberModalProps> = ({
  member,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const isEditing = !!member;

  const [formData, setFormData] = useState<MemberFormData>({
    name: member?.name || '',
    role: member?.role || 'family',
    avatar_url: member?.avatar_url || '',
  });

  const [faces, setFaces] = useState<FaceItem[]>(member?.faces || []);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'info' | 'faces'>('info');
  const [uploadingFace, setUploadingFace] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError(t('members.nameRequired'));
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');

      if (isEditing) {
        await axiosClient.put(`/members/${member.id}`, formData);
      } else {
        await axiosClient.post('/members', formData);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error || t('common.errorOccurred'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSimulateAddFace = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !member) return;

    try {
      setUploadingFace(true);
      setError('');

      // Generate a mock normalized 512D embedding vector for sample upload demo
      const mockEmbedding = Array.from({ length: 512 }, () => (Math.random() - 0.5) * 2);
      const norm = Math.hypot(...mockEmbedding);
      const normalizedEmb = mockEmbedding.map((v) => v / norm);

      // Create a temporary object URL for preview
      const previewUrl = URL.createObjectURL(file);

      const res = await axiosClient.post(`/members/${member.id}/faces`, {
        embedding: normalizedEmb,
        sample_image_url: previewUrl,
        quality_score: 0.88,
        yaw: 5.2,
        pitch: -2.1,
        blur_score: 110.5,
      });

      setFaces((prev) => [res.data, ...prev]);
    } catch (err: any) {
      setError(err?.response?.data?.error || t('members.uploadFaceFailed'));
    } finally {
      setUploadingFace(false);
    }
  };

  const handleDeleteFace = async (faceId: string) => {
    if (!member) return;
    try {
      await axiosClient.delete(`/members/${member.id}/faces/${faceId}`);
      setFaces((prev) => prev.filter((f) => f.id !== faceId));
    } catch (err: any) {
      setError(err?.response?.data?.error || t('common.errorOccurred'));
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div>
            <h2 className="text-lg font-bold text-slate-800">
              {isEditing ? t('members.editMember') : t('members.addMember')}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {t('members.modalSubtitle')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Selection if editing */}
        {isEditing && (
          <div className="px-6 pt-3 flex gap-2 border-b border-slate-100">
            <button
              onClick={() => setActiveTab('info')}
              className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                activeTab === 'info'
                  ? 'border-orange-600 text-orange-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {t('members.tabInfo')}
            </button>
            <button
              onClick={() => setActiveTab('faces')}
              className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'faces'
                  ? 'border-orange-600 text-orange-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Sparkles size={13} />
              {t('members.tabFaces')} ({faces.length})
            </button>
          </div>
        )}

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-medium">
              {error}
            </div>
          )}

          {activeTab === 'info' ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  {t('members.fullName')} *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={t('members.namePlaceholder')}
                  className="input-field w-full text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  {t('members.role')}
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, role: 'family' })}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                      formData.role === 'family'
                        ? 'border-emerald-500 bg-emerald-50/50 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                      <ShieldCheck size={18} />
                    </div>
                    <div>
                      <div className="font-bold text-xs text-slate-800">
                        {t('members.roleFamily')} (Xanh lá)
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {t('members.roleFamilyDesc')}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, role: 'neighbor' })}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                      formData.role === 'neighbor' || formData.role === 'guest'
                        ? 'border-blue-500 bg-blue-50/50 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 mt-0.5">
                      <HeartHandshake size={18} />
                    </div>
                    <div>
                      <div className="font-bold text-xs text-slate-800">
                        {t('members.roleNeighbor')} (Xanh dương)
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {t('members.roleNeighborDesc')}
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  {t('members.avatarUrl')}
                </label>
                <input
                  type="text"
                  value={formData.avatar_url}
                  onChange={(e) => setFormData({ ...formData, avatar_url: e.target.value })}
                  placeholder="https://..."
                  className="input-field w-full text-sm"
                />
              </div>

              <div className="pt-4 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-orange-600 hover:bg-orange-700 text-white shadow-md shadow-orange-600/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              {/* Upload New Face Button */}
              <label className="border-2 border-dashed border-slate-300 hover:border-orange-500 bg-slate-50/50 hover:bg-orange-50/30 rounded-2xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors group">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleSimulateAddFace}
                  className="hidden"
                  disabled={uploadingFace}
                />
                <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-400 group-hover:text-orange-600 group-hover:scale-110 transition-all">
                  <Upload size={18} />
                </div>
                <div className="text-xs font-bold text-slate-700 group-hover:text-orange-600">
                  {uploadingFace ? t('members.processingFace') : t('members.uploadFacePhoto')}
                </div>
                <p className="text-[11px] text-slate-400 text-center">
                  {t('members.uploadFaceHint')}
                </p>
              </label>

              {/* Face Samples List */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {faces.map((f) => (
                  <div
                    key={f.id}
                    className="relative group bg-slate-100 rounded-2xl overflow-hidden aspect-square border border-slate-200/80 shadow-xs"
                  >
                    {f.sample_image_url ? (
                      <img
                        src={f.sample_image_url}
                        alt="Face sample"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 p-2 text-center">
                        <Sparkles size={20} className="text-orange-500 mb-1" />
                        <span className="text-[10px] font-mono">512D Vector</span>
                      </div>
                    )}

                    {/* Quality badge */}
                    <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-slate-900/80 text-white font-mono text-[10px] backdrop-blur-xs flex items-center gap-1">
                      <CheckCircle2 size={10} className="text-emerald-400" />
                      {Math.round(f.quality_score * 100)}%
                    </div>

                    {/* Delete overlay */}
                    <button
                      onClick={() => handleDeleteFace(f.id)}
                      className="absolute top-2 right-2 p-1.5 rounded-lg bg-red-600/90 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow-md"
                      title={t('common.delete')}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>

              {faces.length === 0 && (
                <div className="text-center py-6 text-slate-400 text-xs">
                  {t('members.noFaceSamplesYet')}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
