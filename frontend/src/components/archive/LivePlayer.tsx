import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, AlertCircle, Activity } from 'lucide-react';
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

  // ── Debug Trace State ────────────────────────────────────────────────────
  const [showTrace, setShowTrace] = useState(false);
  const [stats, setStats] = useState({
    renderFps: 0,
    decodeFps: 0,
    droppedFrames: 0,
    latencyMs: 0,
    resolution: '',
    protocol: 'Unknown',
    codec: 'Unknown',
    packetsLost: 0,
    jitter: 0,
  });
  const traceStateRef = useRef({ 
    frames: 0, 
    lastTime: performance.now(), 
    lastDecoded: 0,
    lastDropped: 0,
    lastPacketsLost: 0 
  });

  // ──────────────────────────────────────────────────────────────────────────
  // WebRTC Stats Polling
  // ──────────────────────────────────────────────────────────────────────────
  
  const startStatsPoll = useCallback((video: HTMLVideoElement, pc: RTCPeerConnection) => {
    if (liveEdgeSyncRef.current) clearInterval(liveEdgeSyncRef.current);
    liveEdgeSyncRef.current = setInterval(async () => {
      if (!video || video.paused || video.ended || !pc) return;

      // ── Live Edge Auto-Sync (Catch up if video buffer drifts > 400ms) ──
      try {
        if (video.buffered.length > 0) {
          const liveEnd = video.buffered.end(video.buffered.length - 1);
          const drift = liveEnd - video.currentTime;
          if (drift > 0.4) {
            video.currentTime = liveEnd;
          }
        }
      } catch (_) {}

      try {
        const statsReport = await pc.getStats();
        let inboundVideo: any = null;
        let localCandidate: any = null;
        let remoteCandidate: any = null;
        let codecInfo: any = null;

        statsReport.forEach((stat: any) => {
          if (stat.type === 'inbound-rtp' && stat.kind === 'video') {
            inboundVideo = stat;
            if (inboundVideo.codecId && typeof (statsReport as any).get === 'function') {
              codecInfo = (statsReport as any).get(inboundVideo.codecId);
            }
          }
          if (stat.type === 'candidate-pair' && (stat.state === 'succeeded' || stat.nominated)) {
            if (stat.localCandidateId && typeof (statsReport as any).get === 'function') {
              localCandidate = (statsReport as any).get(stat.localCandidateId);
            }
            if (stat.remoteCandidateId && typeof (statsReport as any).get === 'function') {
              remoteCandidate = (statsReport as any).get(stat.remoteCandidateId);
            }
          }
        });

        const now = performance.now();
        const state = traceStateRef.current;
        const dt = now - state.lastTime;
        
        if (dt >= 1000) {
          const renderFps = Math.round((state.frames * 1000) / dt);
          let decodeFps = 0;
          let dropped = 0;
          let pLost = 0;
          let jitter = 0;
          let codec = 'Unknown';
          let protocol = 'Unknown';

          if (inboundVideo) {
            const newDecoded = inboundVideo.framesDecoded || 0;
            decodeFps = Math.round(((newDecoded - state.lastDecoded) * 1000) / dt);
            
            const newDropped = inboundVideo.framesDropped || 0;
            const newPacketsLost = inboundVideo.packetsLost || 0;
            
            if (state.lastDecoded === 0) {
              // Initial tick: ignore cumulative drops that happened before polling started
              dropped = 0;
              pLost = 0;
            } else {
              dropped = Math.max(0, newDropped - state.lastDropped);
              pLost = Math.max(0, newPacketsLost - state.lastPacketsLost);
            }
            
            state.lastDecoded = newDecoded;
            state.lastDropped = newDropped;
            state.lastPacketsLost = newPacketsLost;
            
            jitter = Math.round((inboundVideo.jitter || 0) * 1000);
          }

          if (codecInfo) codec = codecInfo.mimeType ? codecInfo.mimeType.split('/')[1] : 'Unknown';
          if (localCandidate) protocol = localCandidate.protocol || 'Unknown';
          if (!protocol || protocol === 'Unknown') if (remoteCandidate) protocol = remoteCandidate.protocol || 'Unknown';

          let latency = 0;
          if (video.buffered.length > 0) {
            latency = Math.round((video.buffered.end(video.buffered.length - 1) - video.currentTime) * 1000);
          }

          setStats({
            renderFps,
            decodeFps,
            droppedFrames: dropped,
            latencyMs: latency,
            resolution: `${video.videoWidth}x${video.videoHeight}`,
            protocol: protocol.toUpperCase(),
            codec,
            packetsLost: pLost,
            jitter
          });

          state.lastTime = now;
          state.frames = 0;
        }
      } catch (err) {
        console.warn("Error getting WebRTC stats", err);
      }
    }, 1000);
  }, []);

  const stopStatsPoll = useCallback(() => {
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
  // Canvas overlay render loop (Optimized with ResizeObserver)
  // ──────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Use ResizeObserver instead of polling clientWidth/clientHeight on every animation frame
    const resizeObserver = new ResizeObserver(() => {
      if (canvas) {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
      }
    });
    resizeObserver.observe(canvas);

    let animationFrameId: number;
    const renderLoop = () => {
      traceStateRef.current.frames++; // Track render FPS
      if (video.videoWidth === 0 || video.videoHeight === 0 || canvas.width === 0 || canvas.height === 0) {
        animationFrameId = requestAnimationFrame(renderLoop);
        return;
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
    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
    };
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
      stopStatsPoll();

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
          startStatsPoll(video, pc!);
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
      stopStatsPoll();
      onLiveStatusChange?.(false);
      if (pc) pc.close();
    };
  }, [cameraId, onLiveStatusChange, t, startStatsPoll, stopStatsPoll]);

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
      {/* Debug Trace Overlay */}
      {showTrace && (
        <div className="absolute top-14 right-4 bg-black/70 text-white font-mono text-[11px] p-2 rounded border border-white/20 z-50 backdrop-blur-sm shadow-xl pointer-events-none select-none">
          <div className="text-orange-400 font-bold mb-1 uppercase tracking-wider flex items-center gap-1.5">
            <Activity size={12} /> Live Trace
          </div>
          <table className="mt-1">
            <tbody>
              <tr><td className="pr-3 text-slate-300">Resolution</td><td className="font-semibold">{stats.resolution}</td></tr>
              <tr><td className="pr-3 text-slate-300">Codec/Proto</td><td className="font-semibold text-sky-400">{stats.codec} / {stats.protocol}</td></tr>
              <tr><td className="pr-3 text-slate-300">Render FPS</td><td className="font-semibold text-emerald-400">{stats.renderFps}</td></tr>
              <tr><td className="pr-3 text-slate-300">Decode FPS</td><td className="font-semibold text-emerald-400">{stats.decodeFps}</td></tr>
              <tr>
                <td className="pr-3 text-slate-300">Frames Drop</td>
                <td className={`font-semibold ${stats.droppedFrames > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {stats.droppedFrames}
                </td>
              </tr>
              <tr>
                <td className="pr-3 text-slate-300">Pkt Lost</td>
                <td className={`font-semibold ${stats.packetsLost > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {stats.packetsLost}
                </td>
              </tr>
              <tr>
                <td className="pr-3 text-slate-300">Jitter</td>
                <td className={`font-semibold ${stats.jitter > 200 ? 'text-red-400' : stats.jitter > 100 ? 'text-orange-400' : 'text-emerald-400'}`}>
                  {stats.jitter} ms
                </td>
              </tr>
              <tr>
                <td className="pr-3 text-slate-300">Buffer Lag</td>
                <td className={`font-semibold ${stats.latencyMs > 500 ? 'text-orange-400' : 'text-emerald-400'}`}>
                  {stats.latencyMs} ms
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Control overlay */}
      <div className="absolute top-[max(1rem,env(safe-area-inset-top,0px))] right-[max(1rem,env(safe-area-inset-right,0px))] z-40 flex items-center gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowTrace(!showTrace);
          }}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold backdrop-blur shadow-lg transition-all cursor-pointer border ${
            showTrace 
              ? 'bg-orange-500/80 text-white border-orange-400' 
              : 'bg-black/40 text-white/90 hover:bg-black/60 border-white/20 hover:border-white/40'
          }`}
          title="Toggle Debug Trace"
        >
          <Activity size={14} className="inline-block mr-1.5 -mt-0.5" />
          Trace
        </button>
      </div>
    </div>
  );
};
