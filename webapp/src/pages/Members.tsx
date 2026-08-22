import React, { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Search, ShieldCheck, HeartHandshake } from 'lucide-react';
import axiosClient from '../api/axiosClient';
import type { MemberItem } from '../types/member';
import { MemberCard } from '../components/members/MemberCard';
import { MemberModal } from '../components/members/MemberModal';
import { useTranslation } from '../i18n';
import { PullToRefresh } from '../components/common/PullToRefresh';

const Members: React.FC = () => {
  const { t } = useTranslation();
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'family' | 'neighbor'>('all');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<MemberItem | null>(null);

  const fetchMembers = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await axiosClient.get('/members');
      setMembers(res.data || []);
    } catch (err) {
      console.error('Failed to fetch members:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const handleOpenAdd = () => {
    setSelectedMember(null);
    setIsModalOpen(true);
  };

  const handleEdit = (member: MemberItem) => {
    setSelectedMember(member);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('members.confirmDelete'))) return;
    try {
      await axiosClient.delete(`/members/${id}`);
      setMembers((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      console.error('Failed to delete member:', err);
    }
  };

  const filteredMembers = members.filter((m) => {
    const matchesSearch = m.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (roleFilter === 'family') return m.role === 'family';
    if (roleFilter === 'neighbor') return m.role !== 'family';
    return true;
  });

  const familyCount = members.filter((m) => m.role === 'family').length;
  const guestCount = members.filter((m) => m.role !== 'family').length;

  return (
    <PullToRefresh onRefresh={fetchMembers} className="h-full bg-slate-50/50 overflow-y-auto">
      <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 md:p-6 rounded-3xl border border-slate-200/80 shadow-xs">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center font-bold">
                <Users size={22} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800 tracking-tight">
                  {t('members.title')}
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t('members.subtitle')}
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={handleOpenAdd}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 active:scale-95 text-white text-xs font-bold rounded-2xl shadow-md shadow-orange-600/25 transition-all cursor-pointer"
          >
            <Plus size={16} />
            {t('members.addMemberBtn')}
          </button>
        </div>

        {/* 4-Color Category Legend Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white border border-emerald-200/80 rounded-2xl p-3.5 flex items-center gap-3 shadow-xs">
            <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 shrink-0 shadow-xs shadow-emerald-500/50" />
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-800">Nhóm 1: Gia đình</div>
              <div className="text-[11px] text-emerald-700 font-medium truncate">Khung Xanh lá • {familyCount} người</div>
            </div>
          </div>

          <div className="bg-white border border-blue-200/80 rounded-2xl p-3.5 flex items-center gap-3 shadow-xs">
            <span className="w-3.5 h-3.5 rounded-full bg-blue-500 shrink-0 shadow-xs shadow-blue-500/50" />
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-800">Nhóm 2: Khách quen / Hàng xóm</div>
              <div className="text-[11px] text-blue-700 font-medium truncate">Khung Xanh dương • {guestCount} người</div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-3.5 flex items-center gap-3 shadow-xs">
            <span className="w-3.5 h-3.5 rounded-full bg-slate-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-800">Đang theo dõi</div>
              <div className="text-[11px] text-slate-500 font-medium truncate">Khung Xám • Chưa đủ frame</div>
            </div>
          </div>

          <div className="bg-white border border-red-200/80 rounded-2xl p-3.5 flex items-center gap-3 shadow-xs">
            <span className="w-3.5 h-3.5 rounded-full bg-red-500 shrink-0 shadow-xs shadow-red-500/50" />
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-800">Người lạ</div>
              <div className="text-[11px] text-red-600 font-medium truncate">Khung Đỏ • Kích hoạt NVR clip</div>
            </div>
          </div>
        </div>

        {/* Toolbar: Search + Role Filter */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative w-full sm:w-80">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('members.searchPlaceholder')}
              className="input-field w-full pl-10 text-xs py-2 rounded-2xl bg-white border-slate-200"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-200/70 rounded-2xl w-full sm:w-auto overflow-x-auto">
            <button
              onClick={() => setRoleFilter('all')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                roleFilter === 'all'
                  ? 'bg-white text-orange-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('common.all')} ({members.length})
            </button>
            <button
              onClick={() => setRoleFilter('family')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                roleFilter === 'family'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShieldCheck size={13} />
              {t('members.roleFamily')} ({familyCount})
            </button>
            <button
              onClick={() => setRoleFilter('neighbor')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                roleFilter === 'neighbor'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <HeartHandshake size={13} />
              {t('members.roleNeighbor')} ({guestCount})
            </button>
          </div>
        </div>

        {/* Members Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-44 bg-white/70 rounded-2xl animate-pulse border border-slate-200" />
            ))}
          </div>
        ) : filteredMembers.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredMembers.map((member) => (
              <MemberCard
                key={member.id}
                member={member}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onManageFaces={handleEdit}
              />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-slate-200/80 p-12 text-center flex flex-col items-center justify-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-orange-50 text-orange-500 flex items-center justify-center">
              <Users size={28} />
            </div>
            <h3 className="font-bold text-base text-slate-800">
              {t('members.noMembersFound')}
            </h3>
            <p className="text-xs text-slate-400 max-w-sm">
              {t('members.noMembersHint')}
            </p>
            <button
              onClick={handleOpenAdd}
              className="mt-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer"
            >
              {t('members.addFirstMember')}
            </button>
          </div>
        )}

        {/* Modal */}
        <MemberModal
          isOpen={isModalOpen}
          member={selectedMember}
          onClose={() => setIsModalOpen(false)}
          onSuccess={fetchMembers}
        />
      </div>
    </PullToRefresh>
  );
};

export default Members;
