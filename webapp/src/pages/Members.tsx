import React, { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Search, ShieldCheck, HeartHandshake } from 'lucide-react';
import { api } from '../api/client';
import type { MemberItem } from '../types/member';
import { MemberCard } from '../components/members/MemberCard';
import { MemberModal } from '../components/members/MemberModal';
import { MemberFaceGalleryModal } from '../components/members/MemberFaceGalleryModal';
import { Pagination } from '../components/common/Pagination';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { useTranslation } from '../i18n';
import { PullToRefresh } from '../components/common/PullToRefresh';

const Members: React.FC = () => {
  const { t } = useTranslation();
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [totalMembers, setTotalMembers] = useState(0);
  const [familyCount, setFamilyCount] = useState(0);
  const [guestCount, setGuestCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'family' | 'neighbor'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<MemberItem | null>(null);

  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [galleryMember, setGalleryMember] = useState<MemberItem | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Debounce search query input by 300ms before sending to backend
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Reset to page 1 whenever debounced search query or role filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, roleFilter]);

  const fetchMembers = useCallback(async () => {
    try {
      setIsLoading(true);
      const page = await api.members.list({
        page: currentPage,
        limit: pageSize,
        search: debouncedSearch || undefined,
        role: roleFilter === 'all' ? undefined : roleFilter,
      });
      setMembers(page.data);
      setTotalMembers(page.total);
      if (page.family_count !== undefined) setFamilyCount(page.family_count);
      if (page.guest_count !== undefined) setGuestCount(page.guest_count);
    } catch (err) {
      console.error('Failed to fetch members:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, pageSize, debouncedSearch, roleFilter]);

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

  const handleManageFaces = (member: MemberItem) => {
    setGalleryMember(member);
    setIsGalleryOpen(true);
  };

  const handleDelete = (id: string) => {
    setPendingDeleteId(id);
  };

  const executeDelete = async () => {
    if (!pendingDeleteId) return;
    try {
      setIsDeleting(true);
      await api.members.remove(pendingDeleteId);
      setPendingDeleteId(null);
      fetchMembers();
    } catch (err) {
      console.error('Failed to delete member:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleRoleFilterChange = (filter: 'all' | 'family' | 'neighbor') => {
    setRoleFilter(filter);
  };

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
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 active:scale-95 text-white text-xs font-bold rounded-2xl transition-all cursor-pointer"
          >
            <Plus size={16} />
            {t('members.addMemberBtn')}
          </button>
        </div>

        {/* 4-Color Category Legend Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="bg-white p-4 rounded-2xl border border-emerald-200/80 shadow-xs flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <ShieldCheck size={20} />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-800">{t('members.roleFamily')}</div>
              <div className="text-[11px] text-emerald-600 font-medium">{t('members.familyCount', { count: familyCount })}</div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-blue-200/80 shadow-xs flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <HeartHandshake size={20} />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-800">{t('members.roleNeighbor')}</div>
              <div className="text-[11px] text-blue-600 font-medium">{t('members.guestCount', { count: guestCount })}</div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-amber-200/80 shadow-xs flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <Users size={20} />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-800">{t('members.roleStranger')}</div>
              <div className="text-[11px] text-amber-600 font-medium">{t('members.roleStrangerDesc')}</div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-purple-200/80 shadow-xs flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
              <Users size={20} />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-800">{t('members.roleStaffBanner')}</div>
              <div className="text-[11px] text-purple-600 font-medium">{t('members.roleStaffBannerDesc')}</div>
            </div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="relative w-full sm:w-80">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder={t('members.searchPlaceholder')}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200/80 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
            />
          </div>

          <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => handleRoleFilterChange('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                roleFilter === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {t('common.all')}
            </button>
            <button
              onClick={() => handleRoleFilterChange('family')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                roleFilter === 'family'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {t('members.roleFamily')}
            </button>
            <button
              onClick={() => handleRoleFilterChange('neighbor')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                roleFilter === 'neighbor'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {t('members.roleNeighbor')}
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
        ) : members.length > 0 ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {members.map((member) => (
                <MemberCard
                  key={member.id}
                  member={member}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onManageFaces={handleManageFaces}
                />
              ))}
            </div>

            {/* Pagination Controls */}
            <Pagination
              currentPage={currentPage}
              totalItems={totalMembers}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                setCurrentPage(1);
              }}
              pageSizeOptions={[10, 20, 50]}
            />
          </>
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

        {/* Member Info Modal */}
        <MemberModal
          isOpen={isModalOpen}
          member={selectedMember}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedMember(null);
          }}
          onSuccess={fetchMembers}
        />

        {/* Dedicated Full Face Recognition Gallery Workspace Modal */}
        <MemberFaceGalleryModal
          isOpen={isGalleryOpen}
          member={galleryMember}
          onClose={() => {
            setIsGalleryOpen(false);
            setGalleryMember(null);
          }}
          onUpdate={fetchMembers}
        />

        <ConfirmDialog
          isOpen={!!pendingDeleteId}
          title={t('members.confirmDeleteTitle')}
          message={t('members.confirmDelete')}
          confirmLabel={t('delete')}
          isLoading={isDeleting}
          onConfirm={executeDelete}
          onCancel={() => {
            if (!isDeleting) setPendingDeleteId(null);
          }}
        />
      </div>
    </PullToRefresh>
  );
};

export default Members;
