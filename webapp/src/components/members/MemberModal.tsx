import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, ShieldCheck, HeartHandshake, Camera, User, Trash2 } from 'lucide-react';
import type { MemberItem, MemberFormData } from '../../types/member';
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
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<MemberFormData>({
    name: '',
    role: 'family',
    avatar_url: '',
  });

  const [previewAvatar, setPreviewAvatar] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Reset form whenever modal opens or selected member changes
  useEffect(() => {
    if (isOpen) {
      if (member) {
        const cleanAvatar = member.avatar_url && !member.avatar_url.startsWith('blob:') ? member.avatar_url : '';
        setFormData({
          name: member.name || '',
          role: member.role || 'family',
          avatar_url: cleanAvatar,
        });
        setPreviewAvatar(cleanAvatar);
      } else {
        setFormData({
          name: '',
          role: 'family',
          avatar_url: '',
        });
        setPreviewAvatar('');
      }
      setError('');
    }
  }, [member, isOpen]);

  if (!isOpen) return null;

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingAvatar(true);
      setError('');

      // Create local preview ONLY for UI display during upload
      const localPreview = URL.createObjectURL(file);
      setPreviewAvatar(localPreview);

      // Upload file directly to S3-compatible backend and retrieve presigned link
      const uploadFormData = new FormData();
      uploadFormData.append('file', file);

      const res = await axiosClient.post('/upload/image?folder=avatars', uploadFormData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data?.url) {
        const s3Url = res.data.url;
        setFormData((prev) => ({ ...prev, avatar_url: s3Url }));
        setPreviewAvatar(s3Url);
      } else {
        throw new Error('S3 upload returned empty URL');
      }
    } catch (err: any) {
      console.error('Failed to upload avatar to S3:', err);
      setError(err?.response?.data?.error || t('common.errorOccurred'));
      setPreviewAvatar(formData.avatar_url);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError(t('members.nameRequired'));
      return;
    }

    if (uploadingAvatar) {
      setError('Đang tải ảnh đại diện lên máy chủ lưu trữ, vui lòng chờ...');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');

      const cleanAvatar = formData.avatar_url && !formData.avatar_url.startsWith('blob:') ? formData.avatar_url : '';
      const payload: MemberFormData = {
        ...formData,
        avatar_url: cleanAvatar,
      };

      if (isEditing && member) {
        await axiosClient.put(`/members/${member.id}`, payload);
      } else {
        await axiosClient.post('/members', payload);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error || t('common.errorOccurred'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[100] flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col">
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

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-medium">
              {error}
            </div>
          )}

          {/* Avatar Selector Section */}
          <div className="flex items-center gap-4 p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl">
            <input
              type="file"
              ref={avatarInputRef}
              accept="image/*"
              onChange={handleAvatarFileChange}
              className="hidden"
            />

            {/* Avatar Preview */}
            <div className="relative group shrink-0">
              {previewAvatar ? (
                <img
                  src={previewAvatar}
                  alt="Avatar preview"
                  className="w-16 h-16 rounded-2xl object-cover border-2 border-orange-500/30 shadow-xs"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-orange-100/70 border border-orange-200 flex items-center justify-center text-orange-600 font-bold text-xl shadow-xs">
                  {formData.name.trim() ? (
                    formData.name.trim().charAt(0).toUpperCase()
                  ) : (
                    <User size={26} />
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute inset-0 bg-black/40 rounded-2xl flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer disabled:opacity-100"
                title={t('members.changeAvatar')}
              >
                {uploadingAvatar ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Camera size={18} />
                )}
              </button>
            </div>

            {/* Avatar Controls */}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-slate-800 mb-1">
                {t('members.avatar')}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {uploadingAvatar ? (
                    <div className="w-3.5 h-3.5 border-2 border-orange-600 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Camera size={13} className="text-orange-600" />
                  )}
                  {uploadingAvatar
                    ? t('common.saving')
                    : previewAvatar
                    ? t('members.changeAvatar')
                    : t('members.uploadAvatar')}
                </button>

                {previewAvatar && (
                  <button
                    type="button"
                    onClick={() => {
                      setFormData({ ...formData, avatar_url: '' });
                      setPreviewAvatar('');
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-xl text-xs font-semibold text-red-600 transition-colors cursor-pointer"
                  >
                    <Trash2 size={13} />
                    {t('members.removeAvatar')}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Name Input */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              {t('members.fullName')} *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder={t('members.namePlaceholder')}
              className="input-field w-full text-sm font-medium"
              required
            />
          </div>

          {/* Role Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              {t('members.role')}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, role: 'family' })}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                  formData.role === 'family'
                    ? 'border-emerald-500 bg-emerald-50/50 shadow-sm ring-2 ring-emerald-500/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
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
                    ? 'border-blue-500 bg-blue-50/50 shadow-sm ring-2 ring-blue-500/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
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

          {/* Action Buttons */}
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
              className="px-5 py-2 rounded-xl text-xs font-bold bg-orange-600 hover:bg-orange-700 active:scale-95 text-white transition-all cursor-pointer disabled:opacity-50 shadow-sm"
            >
              {isSubmitting ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
