import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { api } from '../api/client';
import type { CameraItem, Recording } from '../types/recording';
import TimelineControl from '../components/TimelineControl';
import { VideoPlayer } from '../components/archive/VideoPlayer';
import { ArchiveSidebar } from '../components/archive/ArchiveSidebar';
import { RecognitionLogSidebar } from '../components/archive/RecognitionLogSidebar';
import { PlaybackSkeleton } from '../components/common/Skeleton';
import { PullToRefresh } from '../components/common/PullToRefresh';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import {
  useOnCameraStopped,
  useOnCameraStarted,
  useOnCameraUpdated,
} from '@hubsight/sdk/react';
import { useTranslation } from '../i18n';

type CameraStoppedEvent = {
  id?: string;
  name?: string;
  is_stopped?: boolean;
  alternative_id?: string;
  alternative_name?: string;
};

type StoppedPrompt = {
  cameraName: string;
  alternativeId: string;
  alternativeName: string;
};

const Playback = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [cameras, setCameras] = useState<CameraItem[]>([]);
  const [selectedCam, setSelectedCam] = useState<string>('');
  const [dateObj, setDateObj] = useState<Date>(new Date());
  const dateStr = dayjs(dateObj).format('YYYY-MM-DD');
  const [liveOffline, setLiveOffline] = useState(false);
  const [stoppedPrompt, setStoppedPrompt] = useState<StoppedPrompt | null>(null);

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

  const targetTimestampRef = useRef<number | null>(null);
  const selectedCamRef = useRef(selectedCam);
  const modeRef = useRef(mode);

  useEffect(() => {
    selectedCamRef.current = selectedCam;
  }, [selectedCam]);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Fetch cameras on mount
  const fetchCameras = useCallback(async () => {
    try {
      const cams: CameraItem[] = await api.cameras.list();
      setCameras(cams);

      const queryCamId = searchParams.get('camera_id');
      const queryTime = searchParams.get('t');

      let targetCamId = selectedCam;
      if (queryCamId && cams.some((c) => c.id === queryCamId)) {
        targetCamId = queryCamId;
      } else if (cams.length > 0 && !selectedCam) {
        const running = cams.find((c) => !c.is_stopped);
        targetCamId = (running || cams[0]).id;
      }

      if (targetCamId && targetCamId !== selectedCam) {
        setSelectedCam(targetCamId);
      }
      const liveCam = cams.find((c) => c.id === (targetCamId || selectedCam));
      setLiveOffline(Boolean(liveCam?.is_stopped));

      if (queryTime && targetCamId) {
        const ts = parseInt(queryTime, 10);
        if (!isNaN(ts)) {
          targetTimestampRef.current = ts;
          const d = new Date(ts);
          setDateObj(d);
          setActiveMonth(d);
          setMode('archive');
        }
      } else if (queryCamId) {
        setMode('live');
      }

      // Cleanup URL silently
      if (queryCamId || queryTime) {
        setSearchParams({}, { replace: true });
      }

    } catch (err) {
      console.error('Failed to fetch cameras:', err);
    } finally {
      setInitialLoading(false);
    }
  }, [selectedCam, searchParams, setSearchParams]);

  useEffect(() => {
    fetchCameras();
  }, [fetchCameras]);

  // Fetch available days when cam or activeMonth changes
  const fetchAvailableDays = useCallback(async (camId: string, monthDate: Date) => {
    if (!camId) return;
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth() + 1;
    try {
      setAvailableDays(await api.archive.availableDays(camId, year, month));
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
      const recs: Recording[] = await api.archive.timeline({
        camera_id: camId,
        from,
        to,
      });
      setRecordings(recs);
      if (recs.length > 0) {
        if (targetTimestampRef.current) {
          const targetTs = targetTimestampRef.current;
          // Find the recording that covers this timestamp
          const targetRec = recs.find(r => {
            const start = new Date(r.start_at).getTime();
            const end = new Date(r.end_at).getTime();
            return targetTs >= start && targetTs <= end;
          });

          if (targetRec) {
            setActiveRecording(targetRec);
            const start = new Date(targetRec.start_at).getTime();
            seekTargetRef.current = (targetTs - start) / 1000;
          } else {
            // Fallback if no exact match
            setActiveRecording(recs[0]);
          }
          targetTimestampRef.current = null;
        } else {
          setActiveRecording((prev) => {
            if (prev && recs.some((r) => r.id === prev.id)) {
              return prev;
            }
            return recs[0];
          });
        }
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
    setStoppedPrompt(null);
    const cam = cameras.find((c) => c.id === camId);
    setLiveOffline(Boolean(cam?.is_stopped));
  };

  const handleCameraStopped = (raw: CameraStoppedEvent) => {
    const camId = raw?.id;
    if (!camId) return;
    setCameras((prev) => prev.map((c) => (c.id === camId ? { ...c, is_stopped: true } : c)));
    if (selectedCamRef.current !== camId || modeRef.current !== 'live') return;
    setLiveOffline(true);
    setIsLiveStreaming(false);
    if (raw.alternative_id) {
      setStoppedPrompt({
        cameraName: raw.name || '',
        alternativeId: raw.alternative_id,
        alternativeName: raw.alternative_name || '',
      });
    } else {
      setStoppedPrompt(null);
    }
  };

  const handleCameraState = (raw: CameraStoppedEvent) => {
    if (!raw?.id) return;
    setCameras((prev) =>
      prev.map((c) =>
        c.id === raw.id
          ? { ...c, is_stopped: Boolean(raw.is_stopped), name: raw.name || c.name }
          : c
      )
    );
    if (selectedCamRef.current !== raw.id) return;
    if (raw.is_stopped) {
      if (modeRef.current === 'live') {
        setLiveOffline(true);
        setIsLiveStreaming(false);
      }
      return;
    }
    setLiveOffline(false);
    setStoppedPrompt(null);
  };

  useOnCameraStopped(handleCameraStopped);
  useOnCameraStarted(handleCameraState);
  useOnCameraUpdated(handleCameraState);

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

    // Scroll player into view smoothly
    if (playerContainerRef.current) {
      playerContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
    const cam = cameras.find((c) => c.id === selectedCam);
    setLiveOffline(Boolean(cam?.is_stopped));
  };

  const currentCamId = selectedCam || null;
  const selectedCamera = cameras.find((c) => c.id === selectedCam);
  const enableAi = Boolean(selectedCamera?.enable_ai);
  const showBbox = enableAi && selectedCamera?.show_bbox !== false;

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
    <div className="h-full flex min-h-0 min-w-0">
      <PullToRefresh onRefresh={handleRefresh} className="flex-1 min-w-0 h-full bg-slate-50/50 playback-scrollbar">
        <div className="flex flex-col min-w-0 pb-8 max-w-[1920px]">
          {/* 1. YouTube-style Video Player (Sticky on mobile top, static on desktop) */}
          <div className="sticky top-0 z-30 w-full bg-black shadow-md md:static md:shadow-none">
            <VideoPlayer
              mode={mode}
              cameraId={currentCamId}
              enableAi={enableAi}
              showBbox={showBbox}
              activeRecording={activeRecording}
              videoRef={videoRef}
              containerRef={playerContainerRef}
              isLive={isLiveStreaming}
              liveOffline={liveOffline}
              cameraName={selectedCamera?.name}
              onLiveStatusChange={setIsLiveStreaming}
              onLoadedMetadata={handleLoadedMetadata}
              onGoLive={handleGoLive}
            />
          </div>

          <div className="flex flex-col shrink-0 px-4 lg:px-6 mt-4 gap-4">
            <ArchiveSidebar {...sidebarProps} />

            <div
              className={`pb-6 shrink-0 ${!selectedCam ? 'opacity-50 pointer-events-none' : ''
                }`}
            >
              <TimelineControl
                recordings={recordings}
                currentDate={dateStr}
                activeRecording={activeRecording}
                mode={mode}
                liveOffline={liveOffline}
                onSeek={handleSeek}
                onGoLive={handleGoLive}
              />
            </div>
          </div>

          {enableAi && selectedCam && (
            <div className="lg:hidden px-4 mt-0">
              <RecognitionLogSidebar cameraId={selectedCam} />
            </div>
          )}
        </div>
      </PullToRefresh>

      {enableAi && selectedCam && (
        <aside className="hidden lg:flex flex-col w-[22rem] xl:w-[26rem] 2xl:w-[28rem] shrink-0 h-full min-h-0 border-l border-slate-200 bg-white">
          <RecognitionLogSidebar cameraId={selectedCam} variant="docked" />
        </aside>
      )}

      <ConfirmDialog
        isOpen={!!stoppedPrompt}
        title={t('playback.cameraStoppedTitle')}
        message={t('playback.cameraStoppedMessage', { name: stoppedPrompt?.cameraName || '' })}
        confirmLabel={t('playback.switchCamera')}
        cancelLabel={t('playback.stayOnBlack')}
        variant="primary"
        onConfirm={() => {
          const nextId = stoppedPrompt?.alternativeId;
          setStoppedPrompt(null);
          if (nextId) handleSelectCam(nextId);
        }}
        onCancel={() => setStoppedPrompt(null)}
      />
    </div>
  );
};

export default Playback;
