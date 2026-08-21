import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { useSocket } from '../../context/SocketContext';
import axiosClient from '../../api/axiosClient';

interface LivePlayerProps {
  cameraId: number;
  onLiveStatusChange?: (isLive: boolean) => void;
}

export const LivePlayer: React.FC<LivePlayerProps> = ({ cameraId, onLiveStatusChange }) => {
  const { t } = useTranslation();
  const { socket } = useSocket();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [streamError, setStreamError] = useState<string | null>(null);

  // ── Bounding box timestamp queue ──────────────────────────────────────────
  // Each entry: { ts: ms wall-clock when server processed the frame, boxes[] }
  // We buffer the last 3 seconds of events and pick the entry whose timestamp
  // is closest to (Date.now() - BOX_LAG_MS) so that boxes line up with the
  // video frame currently on screen despite YOLO inference delay.
  // BOX_LAG_MS ≈ total CV pipeline latency (YOLO + MQ + Socket.IO).
  // At source parity (go2rtc→CV == go2rtc→WebRTC) this is mostly inference
  // time: set to 0 initially; raise if boxes still lead the video.
  const BOX_LAG_MS = 0;
  type BoxEntry = { ts: number; boxes: any[]; personDetected: boolean };
  const boxQueueRef = useRef<BoxEntry[]>([]);
  const currentBoxesRef = useRef<{ personDetected: boolean; boxes: any[] }>(
    { personDetected: false, boxes: [] }
  );
  // ── Stable viewer ID for AI heartbeat ────────────────────────────────────
  // One UUID per LivePlayer mount; reused across heartbeats so the backend
  // counts this as a single viewer regardless of how many pings are sent.
  const viewerIdRef = useRef<string>(
    Math.random().toString(36).slice(2) + Date.now().toString(36)
  );
  const liveEdgeSyncRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ──────────────────────────────────────────────────────────────────────────
  // Live-edge sync: periodically push the video element to the live edge.
  // The browser buffers a few hundred ms by default; if it drifts > 0.5s
  // behind the newest buffered position, we snap it forward.
  // ──────────────────────────────────────────────────────────────────────────
  const startLiveEdgeSync = useCallback((video: HTMLVideoElement) => {
    if (liveEdgeSyncRef.current) clearInterval(liveEdgeSyncRef.current);
    liveEdgeSyncRef.current = setInterval(() => {
      if (!video || video.paused || video.ended) return;
      if (video.buffered.length === 0) return;
      const liveEdge = video.buffered.end(video.buffered.length - 1);
      const lag = liveEdge - video.currentTime;
      if (lag > 0.5) {
        // Snap to live edge, leave a tiny 80ms buffer for smooth decode
        video.currentTime = liveEdge - 0.08;
      }
    }, 1000);
  }, []);

  const stopLiveEdgeSync = useCallback(() => {
    if (liveEdgeSyncRef.current) {
      clearInterval(liveEdgeSyncRef.current);
      liveEdgeSyncRef.current = null;
    }
  }, []);

  // ── On-demand AI heartbeat ────────────────────────────────────────────────
  // Registers this viewer with the backend every 15s so the vision-service
  // knows to keep CV processing alive. Sends an explicit stop on unmount.
  // Multiple tabs/users watching the same camera share ONE CV thread.
  useEffect(() => {
    if (!cameraId) return;
    const viewerId = viewerIdRef.current;
    const baseUrl = import.meta.env.VITE_API_URL || '/api';

    const ping = () => {
      axiosClient
        .post(`/live/${cameraId}/ai/heartbeat?viewer_id=${viewerId}`)
        .catch(() => {/* silently ignore – non-critical */});
    };

    // Ping immediately then every 15s
    ping();
    const interval = setInterval(ping, 15_000);

    const stop = () => {
      clearInterval(interval);
      // Best-effort stop: use sendBeacon for reliability on page unload
      const url = `${baseUrl}/live/${cameraId}/ai/stop?viewer_id=${viewerId}`;
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url);
      } else {
        axiosClient.post(`/live/${cameraId}/ai/stop?viewer_id=${viewerId}`).catch(() => {});
      }
    };

    // Also handle hard page close / navigation
    window.addEventListener('beforeunload', stop);
    return () => {
      window.removeEventListener('beforeunload', stop);
      stop();
    };
  }, [cameraId]);

  // ──────────────────────────────────────────────────────────────────────────
  // Vision overlay event listeners
  // ──────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    const handleUpdate = (data: any) => {
      const ts = data.timestamp ?? Date.now();
      boxQueueRef.current.push({ ts, boxes: data.boxes || [], personDetected: true });
      // Trim queue: keep only last 3 seconds worth of entries
      const cutoff = Date.now() - 3000;
      boxQueueRef.current = boxQueueRef.current.filter(e => e.ts >= cutoff);
    };
    socket.on('vision.person.entered', handleUpdate);
    socket.on('vision.person.update', handleUpdate);
    socket.on('vision.person.left', (data: any) => {
      const ts = data?.timestamp ?? Date.now();
      boxQueueRef.current.push({ ts, boxes: [], personDetected: false });
    });
    return () => {
      socket.off('vision.person.entered');
      socket.off('vision.person.update');
      socket.off('vision.person.left');
    };
  }, [socket, cameraId]);

  // ──────────────────────────────────────────────────────────────────────────
  // Canvas overlay render loop
  // ──────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    const renderLoop = () => {
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        animationFrameId = requestAnimationFrame(renderLoop);
        return;
      }
      // Only resize when dimensions actually changed (avoid layout thrashing)
      if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // ── Pick the box entry closest to (now - BOX_LAG_MS) ──────────────────
      // This compensates for YOLO inference + MQ + network delay:
      // boxes that just arrived likely correspond to a frame that was shown
      // BOX_LAG_MS milliseconds ago, so we render them now.
      const targetTs = Date.now() - BOX_LAG_MS;
      const queue = boxQueueRef.current;
      let best: BoxEntry | null = null;
      for (const entry of queue) {
        if (entry.ts <= targetTs) {
          if (!best || entry.ts > best.ts) best = entry;
        }
      }
      if (best) currentBoxesRef.current = { personDetected: best.personDetected, boxes: best.boxes };

      const { personDetected, boxes } = currentBoxesRef.current;

      if (personDetected && boxes.length > 0) {
        const videoRatio = video.videoWidth / video.videoHeight;
        const containerRatio = canvas.width / canvas.height;
        let drawWidth = canvas.width, drawHeight = canvas.height;
        let offsetX = 0, offsetY = 0;
        if (containerRatio > videoRatio) {
          drawWidth = canvas.height * videoRatio;
          offsetX = (canvas.width - drawWidth) / 2;
        } else {
          drawHeight = canvas.width / videoRatio;
          offsetY = (canvas.height - drawHeight) / 2;
        }
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 3;
        ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
        boxes.forEach(box => {
          const x = offsetX + box.x1 * drawWidth;
          const y = offsetY + box.y1 * drawHeight;
          const w = (box.x2 - box.x1) * drawWidth;
          const h = (box.y2 - box.y1) * drawHeight;
          ctx.strokeRect(x, y, w, h);
          ctx.fillRect(x, y, w, h);
          ctx.fillStyle = '#ef4444';
          ctx.font = 'bold 12px sans-serif';
          ctx.fillText(`Person ${Math.round(box.confidence * 100)}%`, x, y - 5);
          ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
        });
      }
      animationFrameId = requestAnimationFrame(renderLoop);
    };
    renderLoop();
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  // ──────────────────────────────────────────────────────────────────────────
  // WebRTC connection
  // ──────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let pc: RTCPeerConnection | null = null;
    let isActive = true;

    const initWebRTC = async () => {
      const video = videoRef.current;
      if (!video || !cameraId) { onLiveStatusChange?.(false); return; }

      setIsInitializing(true);
      setStreamError(null);
      onLiveStatusChange?.(false);
      stopLiveEdgeSync();

      try {
        pc = new RTCPeerConnection({
          iceServers: [
            { urls: 'stun:stun.cloudflare.com:3478' },
            { urls: 'stun:stun.l.google.com:19302' },
          ],
          // Prefer minimal bundle policy for lower latency
          bundlePolicy: 'max-bundle',
        });

        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver('audio', { direction: 'recvonly' });

        pc.ontrack = (event) => {
          if (!isActive) return;
          if (event.streams?.[0]) {
            if (video.srcObject !== event.streams[0]) video.srcObject = event.streams[0];
          } else if (event.track) {
            let stream = video.srcObject as MediaStream;
            if (!stream || !(stream instanceof MediaStream)) {
              stream = new MediaStream();
              video.srcObject = stream;
            }
            stream.addTrack(event.track);
          }
          video.muted = true;
          setIsInitializing(false);
          onLiveStatusChange?.(true);
          video.play().catch(err => console.warn('Autoplay prevented:', err));
          startLiveEdgeSync(video);
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // Wait for ICE gathering (max 400ms – enough for same-datacenter STUN)
        await new Promise<void>((resolve) => {
          if (pc!.iceGatheringState === 'complete') { resolve(); return; }
          const onState = () => {
            if (pc!.iceGatheringState === 'complete') {
              pc!.removeEventListener('icegatheringstatechange', onState);
              resolve();
            }
          };
          pc!.addEventListener('icegatheringstatechange', onState);
          setTimeout(() => { pc!.removeEventListener('icegatheringstatechange', onState); resolve(); }, 400);
        });

        if (!isActive) return;

        const baseUrl = import.meta.env.VITE_API_URL || '/api';
        const response = await fetch(`${baseUrl}/live/${cameraId}/webrtc`, {
          method: 'POST',
          body: pc.localDescription?.sdp,
          headers: { 'Content-Type': 'application/sdp' },
          credentials: 'include',
        });

        if (!response.ok) throw new Error('Failed to negotiate WebRTC');
        const answerSdp = await response.text();
        if (!isActive) return;

        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: answerSdp }));

        // ── Minimize jitter buffer on all receivers for real-time display ──
        pc.getReceivers().forEach(receiver => {
          // jitterBufferTarget is a newer API, available in Chrome 107+
          if ('jitterBufferTarget' in receiver) {
            (receiver as any).jitterBufferTarget = 0;
          }
        });

      } catch (err) {
        if (!isActive) return;
        console.error('WebRTC error:', err);
        setStreamError(t('playback.liveError'));
        onLiveStatusChange?.(false);
        setIsInitializing(false);
      }
    };

    initWebRTC();

    return () => {
      isActive = false;
      stopLiveEdgeSync();
      onLiveStatusChange?.(false);
      if (pc) pc.close();
    };
  }, [cameraId, onLiveStatusChange, t, startLiveEdgeSync, stopLiveEdgeSync]);

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden select-none">
      <video
        ref={videoRef}
        controls={false}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-contain pointer-events-none"
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />
      {isInitializing && !streamError && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center gap-3 text-white z-10">
          <Loader2 className="animate-spin text-orange-500" size={36} />
          <p className="text-sm font-medium">{t('playback.connectingWebRtc')}</p>
        </div>
      )}
      {streamError && (
        <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center gap-3 text-slate-300 p-6 text-center z-10">
          <AlertCircle className="text-red-500" size={40} />
          <div className="text-base font-semibold text-white">{t('playback.liveUnavailable')}</div>
          <p className="text-xs text-slate-400 max-w-sm">{streamError}</p>
        </div>
      )}
    </div>
  );
};
