import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Loader2, AlertCircle } from 'lucide-react';

interface LivePlayerProps {
  cameraId: number;
}

export const LivePlayer: React.FC<LivePlayerProps> = ({ cameraId }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [streamError, setStreamError] = useState<string | null>(null);

  useEffect(() => {
    let hls: Hls | null = null;
    const video = videoRef.current;
    if (!video || !cameraId) return;

    setIsInitializing(true);
    setStreamError(null);

    const streamUrl = `/api/live/${cameraId}/index.m3u8`;

    if (Hls.isSupported()) {
      hls = new Hls({
        liveSyncDurationCount: 2, // ultra low latency
        maxLiveSyncPlaybackRate: 1.2,
        lowLatencyMode: true,
        xhrSetup: (xhr) => {
          xhr.withCredentials = true;
        }
      });

      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsInitializing(false);
        video.play().catch(() => {
          // Autoplay policy fallback
        });
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls?.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls?.recoverMediaError();
              break;
            default:
              setStreamError('Unable to connect to live camera stream.');
              hls?.destroy();
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native Safari iOS / macOS HLS support
      video.src = streamUrl;
      video.addEventListener('loadedmetadata', () => {
        setIsInitializing(false);
        video.play().catch(() => {});
      });
      video.addEventListener('error', () => {
        setStreamError('Unable to play live camera stream.');
      });
    } else {
      setStreamError('Your browser does not support HLS live playback.');
    }

    return () => {
      if (hls) {
        hls.destroy();
      }
    };
  }, [cameraId]);

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black">
      <video
        ref={videoRef}
        controls
        autoPlay
        playsInline
        muted
        className="w-full h-full object-contain"
      />

      {isInitializing && !streamError && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center gap-3 text-white z-10">
          <Loader2 className="animate-spin text-orange-500" size={36} />
          <p className="text-sm font-medium">Connecting to live RTSP feed...</p>
        </div>
      )}

      {streamError && (
        <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center gap-3 text-slate-300 p-6 text-center z-10">
          <AlertCircle className="text-red-500" size={40} />
          <div className="text-base font-semibold text-white">Live Stream Unavailable</div>
          <p className="text-xs text-slate-400 max-w-sm">{streamError}</p>
        </div>
      )}
    </div>
  );
};
