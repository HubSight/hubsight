import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { CameraItem } from '@hubsight/sdk';
import { api } from '../api/client';
import { MultiViewToolbar, type MultiViewLayout } from '../components/multiview/MultiViewToolbar';
import { MultiViewSidebar } from '../components/multiview/MultiViewSidebar';
import { MultiViewSlot } from '../components/multiview/MultiViewSlot';
import { MultiViewSelectModal } from '../components/multiview/MultiViewSelectModal';
import {
  useOnCameraStopped,
  useOnCameraStarted,
  useOnCameraUpdated,
} from '@hubsight/sdk/react';

const STORAGE_LAYOUT_KEY = 'hubsight_multiview_layout';
const STORAGE_SLOTS_KEY = 'hubsight_multiview_slots';
const MAX_SLOTS = 8;

export const MultiView: React.FC = () => {
  const [cameras, setCameras] = useState<CameraItem[]>([]);
  const [layout, setLayout] = useState<MultiViewLayout>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_LAYOUT_KEY);
      if (saved) {
        const val = parseInt(saved, 10);
        if ([1, 4, 6, 8].includes(val)) return val as MultiViewLayout;
      }
    } catch {
      // Ignore localStorage errors
    }
    return 4;
  });

  const [slots, setSlots] = useState<(string | null)[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_SLOTS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length >= MAX_SLOTS) {
          return parsed.slice(0, MAX_SLOTS);
        }
      }
    } catch {
      // Ignore JSON error
    }
    return Array(MAX_SLOTS).fill(null);
  });

  const [activeAudioSlot, setActiveAudioSlot] = useState<number | null>(null);
  const [maximizedSlot, setMaximizedSlot] = useState<number | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [selectingSlotIndex, setSelectingSlotIndex] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // ── Fetch Cameras ─────────────────────────────────────────────────────────
  const fetchCameras = useCallback(async () => {
    try {
      const cams: CameraItem[] = await api.cameras.list();
      setCameras(cams);

      // Clean up slots with deleted cameras
      setSlots((prev) => {
        const validIds = new Set(cams.map((c) => c.id));
        const next = prev.map((id) => (id && validIds.has(id) ? id : null));
        return next;
      });
    } catch (err) {
      console.error('Failed to fetch cameras for MultiView:', err);
    }
  }, []);

  useEffect(() => {
    fetchCameras();
  }, [fetchCameras]);

  // Real-time camera lifecycle updates
  useOnCameraStarted(fetchCameras);
  useOnCameraStopped(fetchCameras);
  useOnCameraUpdated(fetchCameras);

  // ── Persistence ───────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_LAYOUT_KEY, layout.toString());
    } catch {
      // Ignore
    }
  }, [layout]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_SLOTS_KEY, JSON.stringify(slots));
    } catch {
      // Ignore
    }
  }, [slots]);

  // ── Fullscreen Support ────────────────────────────────────────────────────
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      if (containerRef.current) {
        containerRef.current.requestFullscreen().catch(() => { });
      } else {
        document.documentElement.requestFullscreen().catch(() => { });
      }
    } else {
      document.exitFullscreen().catch(() => { });
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // ── Slot Actions ──────────────────────────────────────────────────────────
  const handleDropCamera = (
    targetSlotIndex: number,
    cameraId: string,
    sourceSlotIndex?: number,
  ) => {
    setSlots((prev) => {
      const next = [...prev];

      // If dragging from another slot (Swap)
      if (typeof sourceSlotIndex === 'number' && sourceSlotIndex !== targetSlotIndex) {
        const temp = next[targetSlotIndex];
        next[targetSlotIndex] = next[sourceSlotIndex];
        next[sourceSlotIndex] = temp;
      } else {
        // Dragging from sidebar: If already in another slot, remove from old slot
        const existingIdx = next.indexOf(cameraId);
        if (existingIdx !== -1 && existingIdx !== targetSlotIndex) {
          next[existingIdx] = null;
        }
        next[targetSlotIndex] = cameraId;
      }

      return next;
    });
  };

  const handleRemoveCamera = (slotIndex: number) => {
    setSlots((prev) => {
      const next = [...prev];
      next[slotIndex] = null;
      return next;
    });
    if (activeAudioSlot === slotIndex) setActiveAudioSlot(null);
    if (maximizedSlot === slotIndex) setMaximizedSlot(null);
  };

  const handleQuickAdd = (cameraId: string) => {
    // Check if camera is already in a slot
    const existingIndex = slots.indexOf(cameraId);
    if (existingIndex !== -1) {
      // Already in grid
      return;
    }

    // Find first empty slot within current layout
    const activeSlotCount = layout;
    let targetIndex = -1;
    for (let i = 0; i < activeSlotCount; i++) {
      if (!slots[i]) {
        targetIndex = i;
        break;
      }
    }

    // If all active slots full, find any empty slot in MAX_SLOTS, or replace last active slot
    if (targetIndex === -1) {
      targetIndex = activeSlotCount - 1;
    }

    handleDropCamera(targetIndex, cameraId);
  };

  const handleAutoFill = () => {
    const activeCams = cameras.filter((c) => c.is_active && !c.is_stopped);
    setSlots((prev) => {
      const next = [...prev];
      let camIdx = 0;
      for (let i = 0; i < layout; i++) {
        if (!next[i] && camIdx < activeCams.length) {
          // Find next camera not already in grid
          while (camIdx < activeCams.length && next.includes(activeCams[camIdx].id)) {
            camIdx++;
          }
          if (camIdx < activeCams.length) {
            next[i] = activeCams[camIdx].id;
            camIdx++;
          }
        }
      }
      return next;
    });
  };

  const handleClearAll = () => {
    setSlots(Array(MAX_SLOTS).fill(null));
    setActiveAudioSlot(null);
    setMaximizedSlot(null);
  };

  const handleToggleAudio = (slotIndex: number) => {
    setActiveAudioSlot((curr) => (curr === slotIndex ? null : slotIndex));
  };

  const handleToggleMaximize = (slotIndex: number) => {
    setMaximizedSlot((curr) => (curr === slotIndex ? null : slotIndex));
  };

  // ── Compute visible slots according to layout ─────────────────────────────
  const visibleSlotIndices = Array.from({ length: layout }, (_, i) => i);

  // Class helper for grid layouts
  const getGridClasses = () => {
    if (maximizedSlot !== null) {
      return 'grid grid-cols-1 grid-rows-1';
    }
    switch (layout) {
      case 1:
        return 'grid grid-cols-1 grid-rows-1';
      case 4:
        return 'grid grid-cols-1 sm:grid-cols-2 grid-rows-2';
      case 6:
        return 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 lg:grid-rows-3';
      case 8:
        return 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 lg:grid-rows-4';
      default:
        return 'grid grid-cols-2 grid-rows-2';
    }
  };

  // Custom positioning class for individual slots in 1+5 and 1+7 layouts
  const getSlotLayoutClass = (idx: number) => {
    if (maximizedSlot !== null) {
      return idx === maximizedSlot ? 'col-span-full row-span-full' : 'hidden';
    }

    if (layout === 6) {
      // 1+5 layout: Slot 0 takes 2x2 on large screens, remaining 5 slots take 1x1
      if (idx === 0) {
        return 'lg:col-span-2 lg:row-span-2';
      }
      return 'col-span-1 row-span-1';
    }

    if (layout === 8) {
      // 1+7 layout: Slot 0 takes 3x3 on large screens, remaining 7 slots take 1x1 around it
      if (idx === 0) {
        return 'lg:col-span-3 lg:row-span-3';
      }
      return 'col-span-1 row-span-1';
    }

    return 'col-span-1 row-span-1';
  };

  return (
    <div
      ref={containerRef}
      className={`h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden select-none ${isFullscreen ? 'fixed inset-0 z-50 p-safe' : ''
        }`}
    >
      {/* Top Toolbar */}
      <MultiViewToolbar
        layout={layout}
        onSelectLayout={(l) => {
          setLayout(l);
          if (maximizedSlot !== null && maximizedSlot >= l) {
            setMaximizedSlot(null);
          }
        }}
        onAutoFill={handleAutoFill}
        onClearAll={handleClearAll}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        onToggleSidebar={() => setIsMobileSidebarOpen((o) => !o)}
      />

      {/* Main Content: Sidebar + Video Grid */}
      <div className="flex-1 flex min-h-0 min-w-0 relative">
        {/* Desktop Sidebar */}
        <MultiViewSidebar
          cameras={cameras}
          slots={slots}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((c) => !c)}
          onQuickAdd={handleQuickAdd}
        />

        {/* Mobile Drawer Backdrop */}
        {isMobileSidebarOpen && (
          <div
            className="lg:hidden fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
        )}

        {/* Mobile Drawer Sidebar */}
        <div
          className={`lg:hidden fixed inset-y-0 left-0 z-50 w-72 bg-white shadow-2xl transition-transform duration-300 ease-in-out ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
        >
          <MultiViewSidebar
            cameras={cameras}
            slots={slots}
            isCollapsed={false}
            onToggleCollapse={() => setIsMobileSidebarOpen(false)}
            onQuickAdd={(id) => {
              handleQuickAdd(id);
              setIsMobileSidebarOpen(false);
            }}
          />
        </div>

        {/* Center: Video Grid */}
        <main className="flex-1 min-h-0 min-w-0 bg-slate-950 p-2 sm:p-2.5 overflow-hidden flex flex-col">
          <div className={`w-full h-full gap-2 sm:gap-2.5 ${getGridClasses()}`}>
            {visibleSlotIndices.map((slotIndex) => {
              const camId = slots[slotIndex];
              const camDetails = cameras.find((c) => c.id === camId);

              return (
                <div
                  key={slotIndex}
                  className={`w-full h-full min-h-[140px] ${getSlotLayoutClass(slotIndex)}`}
                >
                  <MultiViewSlot
                    slotIndex={slotIndex}
                    cameraId={camId}
                    camera={camDetails}
                    isAudioActive={activeAudioSlot === slotIndex}
                    isMaximized={maximizedSlot === slotIndex}
                    onDropCamera={handleDropCamera}
                    onRemoveCamera={handleRemoveCamera}
                    onToggleAudio={handleToggleAudio}
                    onToggleMaximize={handleToggleMaximize}
                    onOpenSelector={(idx) => setSelectingSlotIndex(idx)}
                  />
                </div>
              );
            })}
          </div>
        </main>
      </div>

      {/* Modal Quick Selector for empty slot (mobile/click-to-assign) */}
      <MultiViewSelectModal
        slotIndex={selectingSlotIndex}
        cameras={cameras}
        slots={slots}
        onSelectCamera={(slotIdx, camId) => {
          handleDropCamera(slotIdx, camId);
          setSelectingSlotIndex(null);
        }}
        onClose={() => setSelectingSlotIndex(null)}
      />
    </div>
  );
};

export default MultiView;

