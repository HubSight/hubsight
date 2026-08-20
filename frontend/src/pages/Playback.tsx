import { useState, useEffect, useRef } from 'react';
import dayjs from 'dayjs';
import axiosClient from '../api/axiosClient';
import type { CameraItem, Recording } from '../types/recording';
import TimelineControl from '../components/TimelineControl';
import { VideoPlayer } from '../components/archive/VideoPlayer';
import { ArchiveSidebar } from '../components/archive/ArchiveSidebar';

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

  const videoRef = useRef<HTMLVideoElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const seekTargetRef = useRef<number | null>(null);

  // Fetch cameras on mount
  useEffect(() => {
    axiosClient
      .get('/cameras')
      .then((res) => {
        setCameras(res.data || []);
        if (res.data && res.data.length > 0) {
          setSelectedCam(res.data[0].id.toString());
        }
      })
      .catch(console.error);
  }, []);

  // Fetch available days when cam or activeMonth changes
  useEffect(() => {
    if (!selectedCam) return;

    const year = activeMonth.getFullYear();
    const month = activeMonth.getMonth() + 1;

    axiosClient
      .get(`/archive/${selectedCam}/available-days?year=${year}&month=${month}`)
      .then((res) => {
        setAvailableDays(res.data || []);
      })
      .catch(console.error);
  }, [selectedCam, activeMonth]);

  // Fetch timeline when cam or date changes
  useEffect(() => {
    if (!selectedCam || !dateStr) return;

    setLoading(true);
    const from = dayjs(`${dateStr}T00:00:00Z`).toISOString();
    const to = dayjs(`${dateStr}T23:59:59Z`).toISOString();

    axiosClient
      .get(
        `/archive/timeline?from=${encodeURIComponent(from)}&to=${encodeURIComponent(
          to
        )}&camera_id=${selectedCam}`
      )
      .then((res) => {
        setRecordings(res.data || []);
        if (res.data && res.data.length > 0 && !activeRecording) {
          setActiveRecording(res.data[0]);
        } else if (!res.data || res.data.length === 0) {
          setActiveRecording(null);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedCam, dateStr, activeRecording]);

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

  const currentCamId = selectedCam ? parseInt(selectedCam, 10) : null;

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

  return (
    <div className="h-full overflow-y-auto bg-slate-50/50">
      <div className="flex-1 flex flex-col min-w-0 max-w-[1920px] mx-auto">
          {/* 1. YouTube-style Video Player with embedded controls for Live & Archive */}
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
    </div>
  );
};

export default Playback;

