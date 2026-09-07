import React from 'react';
import { User, Edit2, Trash2, Camera, ShieldCheck, HeartHandshake, Sparkles } from 'lucide-react';
import type { MemberItem } from '../../types/member';
import { useTranslation } from '../../i18n';

interface MemberCardProps {
  member: MemberItem;
  onEdit: (member: MemberItem) => void;
  onDelete: (id: string) => void;
  onManageFaces: (member: MemberItem) => void;
}

export const MemberCard: React.FC<MemberCardProps> = ({
  member,
  onEdit,
  onDelete,
  onManageFaces,
}) => {
  const { t } = useTranslation();

  const isFamily = member.role === 'family';

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between group relative overflow-hidden">
      {/* Top accent bar matching category color */}
      <div
        className={`absolute top-0 left-0 right-0 h-1.5 ${
          isFamily ? 'bg-emerald-500' : 'bg-blue-500'
        }`}
      />

      <div>
        {/* Header: Avatar + Info */}
        <div className="flex items-start gap-4">
          <div className="relative">
            {member.avatar_url ? (
              <img
                src={member.avatar_url}
                alt={member.name}
                className="w-14 h-14 rounded-2xl object-cover border-2 border-slate-100 shadow-sm"
              />
            ) : (
              <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-lg shadow-sm ${
                  isFamily
                    ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                    : 'bg-blue-50 text-blue-600 border border-blue-200'
                }`}
              >
                <User size={24} />
              </div>
            )}
            <span
              className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${
                member.is_active ? 'bg-emerald-500' : 'bg-slate-400'
              }`}
            />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-base text-slate-800 truncate" title={member.name}>
              {member.name}
            </h3>

            {/* Role Badge */}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {isFamily ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <ShieldCheck size={12} className="text-emerald-600" />
                  {t('members.roleFamily')}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  <HeartHandshake size={12} className="text-blue-600" />
                  {member.role === 'neighbor' ? t('members.roleNeighbor') : t('members.roleGuest')}
                </span>
              )}

              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
                <Sparkles size={11} className="text-orange-500" />
                {member.face_count} {t('members.faceSamplesCount')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="mt-5 pt-3.5 border-t border-slate-100 flex items-center justify-between gap-2">
        <button
          onClick={() => onManageFaces(member)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-50 hover:bg-orange-50 text-slate-700 hover:text-orange-600 border border-slate-200 hover:border-orange-200 transition-colors cursor-pointer"
        >
          <Camera size={14} />
          {t('members.manageFaces')}
        </button>

        <div className="flex items-center gap-1">
          <button
            onClick={() => onEdit(member)}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
            title={t('common.edit')}
          >
            <Edit2 size={15} />
          </button>
          <button
            onClick={() => onDelete(member.id)}
            className="p-2 rounded-xl text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
            title={t('common.delete')}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </div>
  );
};
