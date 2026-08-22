import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, AlertCircle, Activity, Volume2, Volume1, VolumeX } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { useSocket } from '../../context/SocketContext';
import axiosClient from '../../api/axiosClient';

interface LivePlayerProps {
  cameraId: string;
  onLiveStatusChange?: (isLive: boolean) => void;
}

export const LivePlayer: React.FC<LivePlayerProps> = ({ cameraId, onLiveStatusChange }) => {
  const { t } = useTranslation();
  const { socket } = useSocket();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [hasAudioTrack, setHasAudioTrack] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isMuted || volume === 0) {
      const targetVol = volume > 0 ? volume : 1;
      video.muted = false;
      video.volume = targetVol;
      setVolume(targetVol);
      setIsMuted(false);
      video.play().catch(() => {});
    } else {
      video.muted = true;
      setIsMuted(true);
    }
  };

  const handleVolumeChange = (newVolume: number) => {
    const video = videoRef.current;
    setVolume(newVolume);
    if (!video) return;
    if (newVolume === 0) {
      video.muted = true;
      setIsMuted(true);
    } else {
      video.muted = false;
      video.volume = newVolume;
      setIsMuted(false);
      video.play().catch(() => {});
    }
  };

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
      if (data?.camera_id && String(data.camera_id) !== String(cameraId)) return;
      const ts = data.timestamp ?? Date.now();
      boxQueueRef.current.push({ ts, boxes: data.boxes || [], personDetected: true });
      // Trim queue: keep only last 3 seconds worth of entries
      const cutoff = Date.now() - 3000;
      boxQueueRef.current = boxQueueRef.current.filter(e => e.ts >= cutoff);
    };
    socket.on('vision.person.entered', handleUpdate);
    socket.on('vision.person.update', handleUpdate);
    socket.on('vision.person.left', (data: any) => {
      if (data?.camera_id && String(data.camera_id) !== String(cameraId)) return;
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
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = 'rgba(16, 185, 129, 0.4)';
        ctx.shadowBlur = 6;
        
        boxes.forEach(box => {
          const x = offsetX + box.x1 * drawWidth;
          const y = offsetY + box.y1 * drawHeight;
          const w = (box.x2 - box.x1) * drawWidth;
          const h = (box.y2 - box.y1) * drawHeight;

          // Draw emerald green bounding box
          ctx.strokeRect(x, y, w, h);
          ctx.fillStyle = 'rgba(16, 185, 129, 0.12)';
          ctx.fillRect(x, y, w, h);

          // Draw emerald badge label
          const labelText = box.track_id 
            ? `#${box.track_id} Person ${Math.round(box.confidence * 100)}%` 
            : `Person ${Math.round(box.confidence * 100)}%`;
          
          ctx.font = '600 11px system-ui, -apple-system, sans-serif';
          const textWidth = ctx.measureText(labelText).width;
          const badgeHeight = 18;
          const badgeY = Math.max(offsetY, y - badgeHeight - 2);

          // Badge background
          ctx.fillStyle = 'rgba(5, 150, 105, 0.95)';
          ctx.beginPath();
          ctx.roundRect ? ctx.roundRect(x, badgeY, textWidth + 12, badgeHeight, 4) : ctx.rect(x, badgeY, textWidth + 12, badgeHeight);
          ctx.fill();

          // Badge text
          ctx.fillStyle = '#ffffff';
          ctx.shadowBlur = 0;
          ctx.fillText(labelText, x + 6, badgeY + 13);
          ctx.shadowBlur = 6;
        });
        ctx.shadowBlur = 0;
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
        pc.addTransceiver('audio', { direction: 'recvonly' });

        const mediaStream = new MediaStream();
        video.srcObject = mediaStream;

        pc.ontrack = (event) => {
          if (!isActive) return;
          if (event.track) {
            if (event.track.kind === 'audio') {
              setHasAudioTrack(true);
            }
            if (!mediaStream.getTracks().includes(event.track)) {
              mediaStream.addTrack(event.track);
            }
          }
          if (event.streams?.[0]) {
            event.streams[0].getTracks().forEach(track => {
              if (track.kind === 'audio') {
                setHasAudioTrack(true);
              }
              if (!mediaStream.getTracks().includes(track)) {
                mediaStream.addTrack(track);
              }
            });
          }
          setIsInitializing(false);
          onLiveStatusChange?.(true);

          // Attempt 100% volume unmuted by default
          video.volume = 1.0;
          video.muted = false;
          setVolume(1.0);
          setIsMuted(false);

          video.play().catch(err => {
            console.warn('Unmuted autoplay prevented by browser policy, falling back to muted initial playback:', err);
            video.muted = true;
            setIsMuted(true);
            video.play().catch(e => console.warn('Autoplay failed:', e));
          });
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
            <Activity size={12} /> {t('playback.traceTitle')}
          </div>
          <table className="mt-1">
            <tbody>
              <tr><td className="pr-3 text-slate-300">{t('playback.traceResolution')}</td><td className="font-semibold">{stats.resolution}</td></tr>
              <tr><td className="pr-3 text-slate-300">{t('playback.traceCodecProto')}</td><td className="font-semibold text-sky-400">{stats.codec} / {stats.protocol}</td></tr>
              <tr><td className="pr-3 text-slate-300">{t('playback.traceAudioTrack')}</td><td className={`font-semibold ${hasAudioTrack ? 'text-emerald-400' : 'text-slate-400'}`}>{hasAudioTrack ? t('playback.traceDetected') : t('playback.traceNone')}</td></tr>
              <tr><td className="pr-3 text-slate-300">{t('playback.traceRenderFps')}</td><td className="font-semibold text-emerald-400">{stats.renderFps}</td></tr>
              <tr><td className="pr-3 text-slate-300">{t('playback.traceDecodeFps')}</td><td className="font-semibold text-emerald-400">{stats.decodeFps}</td></tr>
              <tr>
                <td className="pr-3 text-slate-300">{t('playback.traceDroppedFrames')}</td>
                <td className={`font-semibold ${stats.droppedFrames > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {stats.droppedFrames}
                </td>
              </tr>
              <tr>
                <td className="pr-3 text-slate-300">{t('playback.tracePktLost')}</td>
                <td className={`font-semibold ${stats.packetsLost > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {stats.packetsLost}
                </td>
              </tr>
              <tr>
                <td className="pr-3 text-slate-300">{t('playback.traceJitter')}</td>
                <td className={`font-semibold ${stats.jitter > 200 ? 'text-red-400' : stats.jitter > 100 ? 'text-orange-400' : 'text-emerald-400'}`}>
                  {stats.jitter} ms
                </td>
              </tr>
              <tr>
                <td className="pr-3 text-slate-300">{t('playback.traceBufferLag')}</td>
                <td className={`font-semibold ${stats.latencyMs > 500 ? 'text-orange-400' : 'text-emerald-400'}`}>
                  {stats.latencyMs} ms
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Top-Right Control overlay */}
      <div className="absolute top-[max(1rem,env(safe-area-inset-top,0px))] right-[max(1rem,env(safe-area-inset-right,0px))] z-40 flex items-center gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowTrace(!showTrace);
          }}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold backdrop-blur shadow-lg transition-all cursor-pointer border ${
            showTrace 
              ? 'bg-orange-500/80 text-white border-orange-400' 
              : 'bg-black/40 text-white/90 hover:bg-black/60 border-white/20 hover:border-white/40'
          }`}
          title={t('playback.toggleTrace')}
        >
          <Activity size={14} className="inline-block mr-1.5 -mt-0.5" />
          Trace
        </button>
      </div>

      {/* Pure White Volume Control - Positioned on the Bottom Right */}
      <div 
        className="absolute bottom-2.5 right-14 sm:right-16 z-30 flex items-center gap-2 pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Unmute hint button if browser blocked unmuted autoplay */}
        {isMuted && (
          <button
            type="button"
            onClick={toggleMute}
            className="text-xs px-2.5 py-1 bg-white/20 hover:bg-white/30 text-white font-medium rounded-lg border border-white/30 backdrop-blur-md shadow-lg flex items-center gap-1.5 transition-all cursor-pointer animate-pulse whitespace-nowrap"
            title={t('playback.unmute')}
          >
            <Volume2 size={13} className="text-white" />
            <span className="hidden sm:inline">{t('playback.unmuteBtn')}</span>
          </button>
        )}

        {/* Clean White Volume Slider Widget */}
        <div className="group/vol flex items-center gap-2 px-2.5 py-1 rounded-xl bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/20 hover:border-white/40 transition-all shadow-lg">
          <button
            type="button"
            onClick={toggleMute}
            className="text-white hover:text-white/80 transition-colors cursor-pointer flex items-center justify-center p-0.5 focus:outline-none"
            title={isMuted ? t('playback.unmute') : t('playback.mute')}
          >
            {isMuted || volume === 0 ? (
              <VolumeX size={17} className="text-white/60 hover:text-white" />
            ) : volume < 0.5 ? (
              <Volume1 size={17} className="text-white" />
            ) : (
              <Volume2 size={17} className="text-white" />
            )}
          </button>

          {/* Interactive pure white volume slider */}
          <div className="w-16 sm:w-20 flex items-center">
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              className="w-full h-1 bg-white/30 rounded-lg appearance-none cursor-pointer accent-white hover:accent-white"
              title={t('playback.volumePercent', { percent: Math.round((isMuted ? 0 : volume) * 100) })}
            />
          </div>
          
          <span className="text-[11px] font-mono text-white min-w-[32px] text-right select-none">
            {isMuted ? 'Mute' : `${Math.round(volume * 100)}%`}
          </span>
        </div>
      </div>
    </div>
  );
};
