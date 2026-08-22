import { useState, useEffect, useRef, useCallback } from 'react';
import dayjs from 'dayjs';
import axiosClient from '../api/axiosClient';
import type { CameraItem, Recording } from '../types/recording';
import TimelineControl from '../components/TimelineControl';
import { VideoPlayer } from '../components/archive/VideoPlayer';
import { ArchiveSidebar } from '../components/archive/ArchiveSidebar';
import { PlaybackSkeleton } from '../components/common/Skeleton';
import { PullToRefresh } from '../components/common/PullToRefresh';

const Playback = () => {
  const [cameras, setCameras] = useState<CameraItem[]>([]);
  const [selectedCam, setSelectedCam] = useState<string>('');
  const [dateObj, setDateObj] = useState<Date>(new Date());
  const dateStr = dayjs(dateObj).format('YYYY-MM-DD');

  const [activeMonth, setActiveMonth] = useState<Date>(dateObj);
  const [availableDays, setAvailableDays] = useState<number[]>([]);

  // Playback Mode: 'live' | 'archive'
  const [mode, setMode] = useState<'live' | 'archive'>('live');
  const [isLiveStreaming, setIsLiveStreaming] = useState(false);

  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [activeRecording, setActiveRecording] = useState<Recording | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const seekTargetRef = useRef<number | null>(null);

  // Fetch cameras on mount
  const fetchCameras = useCallback(async () => {
    try {
      const res = await axiosClient.get('/cameras');
      const cams: CameraItem[] = res.data || [];
      setCameras(cams);
      if (cams.length > 0 && !selectedCam) {
        setSelectedCam(cams[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch cameras:', err);
    } finally {
      setInitialLoading(false);
    }
  }, [selectedCam]);

  useEffect(() => {
    fetchCameras();
  }, [fetchCameras]);

  // Fetch available days when cam or activeMonth changes
  const fetchAvailableDays = useCallback(async (camId: string, monthDate: Date) => {
    if (!camId) return;
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth() + 1;
    try {
      const res = await axiosClient.get(`/archive/${camId}/available-days?year=${year}&month=${month}`);
      setAvailableDays(res.data || []);
    } catch (err) {
      console.error('Failed to fetch available days:', err);
    }
  }, []);

  useEffect(() => {
    if (selectedCam) {
      fetchAvailableDays(selectedCam, activeMonth);
    }
  }, [selectedCam, activeMonth, fetchAvailableDays]);

  // Fetch timeline when cam or date changes
  const fetchTimeline = useCallback(async (camId: string, dateString: string) => {
    if (!camId || !dateString) return;

    setLoading(true);
    const from = dayjs(`${dateString}T00:00:00Z`).toISOString();
    const to = dayjs(`${dateString}T23:59:59Z`).toISOString();

    try {
      const res = await axiosClient.get(
        `/archive/timeline?from=${encodeURIComponent(from)}&to=${encodeURIComponent(
          to
        )}&camera_id=${camId}`
      );
      const recs: Recording[] = res.data || [];
      setRecordings(recs);
      if (recs.length > 0) {
        setActiveRecording((prev) => {
          if (prev && recs.some((r) => r.id === prev.id)) {
            return prev;
          }
          return recs[0];
        });
      } else {
        setActiveRecording(null);
      }
    } catch (err) {
      console.error('Failed to fetch timeline recordings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedCam && dateStr) {
      fetchTimeline(selectedCam, dateStr);
    }
  }, [selectedCam, dateStr, fetchTimeline]);

  // Handle pull to refresh action
  const handleRefresh = async () => {
    await fetchCameras();
    if (selectedCam) {
      await Promise.all([
        fetchAvailableDays(selectedCam, activeMonth),
        fetchTimeline(selectedCam, dateStr),
      ]);
    }
  };

  // When user changes camera, default back to Live
  const handleSelectCam = (camId: string) => {
    setSelectedCam(camId);
    setMode('live');
    setIsLiveStreaming(false);
  };

  // When user seeks on timeline, automatically switch to Archive mode
  const handleSeek = (rec: Recording, offsetSeconds: number) => {
    setMode('archive');
    setIsLiveStreaming(false);
    if (activeRecording?.id !== rec.id) {
      seekTargetRef.current = offsetSeconds;
      setActiveRecording(rec);
    } else if (videoRef.current) {
      videoRef.current.currentTime = offsetSeconds;
      videoRef.current.play();
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current && seekTargetRef.current !== null) {
      videoRef.current.currentTime = seekTargetRef.current;
      videoRef.current.play();
      seekTargetRef.current = null;
    }
  };

  const handleGoLive = () => {
    setMode('live');
  };

  const currentCamId = selectedCam || null;

  const sidebarProps = {
    cameras,
    selectedCam,
    onSelectCam: handleSelectCam,
    dateObj,
    onSelectDate: (date: Date) => {
      setDateObj(date);
      setMode('archive');
      setIsLiveStreaming(false);
    },
    recordings,
    loading,
    availableDays,
    onMonthChange: (date: Date | null) => {
      if (date) {
        setActiveMonth(date);
      }
    }
  };

  if (initialLoading && cameras.length === 0) {
    return (
      <div className="h-full overflow-y-auto bg-slate-50/50 p-4 md:p-6">
        <PlaybackSkeleton />
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={handleRefresh} className="h-full bg-slate-50/50 playback-scrollbar">
      <div className="flex-1 flex flex-col min-w-0 max-w-[1920px] mx-auto pb-8">
        {/* 1. YouTube-style Video Player (Sticky on mobile top, static on desktop) */}
        <div className="sticky top-0 z-30 w-full bg-black shadow-md md:static md:shadow-none">
          <VideoPlayer
            mode={mode}
            cameraId={currentCamId}
            activeRecording={activeRecording}
            videoRef={videoRef}
            containerRef={playerContainerRef}
            isLive={isLiveStreaming}
            onLiveStatusChange={setIsLiveStreaming}
            onLoadedMetadata={handleLoadedMetadata}
            onGoLive={handleGoLive}
          />
        </div>

        {/* Wrapper for items below video */}
        <div className="flex flex-col shrink-0 px-4 lg:px-6 mt-4 gap-4">
          {/* 2. Horizontal Settings Toolbar */}
          <ArchiveSidebar {...sidebarProps} />

          {/* 3. Interactive Timeline */}
          <div
            className={`pb-6 shrink-0 ${
              !selectedCam ? 'opacity-50 pointer-events-none' : ''
            }`}
          >
            <TimelineControl
              recordings={recordings}
              currentDate={dateStr}
              activeRecording={activeRecording}
              mode={mode}
              onSeek={handleSeek}
              onGoLive={handleGoLive}
            />
          </div>
        </div>
      </div>
    </PullToRefresh>
  );
};

export default Playback;
