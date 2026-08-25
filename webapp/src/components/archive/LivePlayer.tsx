import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, AlertCircle, Activity, Volume2, Volume1, VolumeX, Sparkles } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { useSocket } from '../../context/SocketContext';
import axiosClient from '../../api/axiosClient';

const releasePoolStream = (cameraId: string, streamName: string) => {
  const baseUrl = import.meta.env.VITE_API_URL || '/api';
  const url = `${baseUrl}/live/${cameraId}/release?stream_name=${encodeURIComponent(streamName)}`;
  fetch(url, { method: 'POST', credentials: 'include', keepalive: true }).catch(() => {});
};

interface OverlayBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  state?: string;
  name?: string;
}

const BOX_COLORS: Record<string, string> = {
  family: '#10b981',
  guest: '#3b82f6',
  stranger: '#ef4444',
  danger: '#f97316',
  fall: '#f43f5e',
  verifying: '#94a3b8',
};

interface LivePlayerProps {
  cameraId: string;
  enableAi?: boolean;
  showBbox?: boolean;
  onLiveStatusChange?: (isLive: boolean) => void;
}

export const LivePlayer: React.FC<LivePlayerProps> = ({ cameraId, enableAi, showBbox, onLiveStatusChange }) => {
  const { t } = useTranslation();
  const { socket } = useSocket();
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const overlayWrapRef = useRef<HTMLDivElement>(null);
  const boxesRef = useRef<OverlayBox[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [hasAudioTrack, setHasAudioTrack] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  const drawBoxes = useCallback(() => {
    const canvas = overlayRef.current;
    const video = videoRef.current;
    const wrap = overlayWrapRef.current;
    if (!canvas || !video || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cssW = wrap.clientWidth;
    const cssH = wrap.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(cssW * dpr));
    canvas.height = Math.max(1, Math.round(cssH * dpr));
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    if (!showBbox || !enableAi || boxesRef.current.length === 0) return;

    const vidW = video.videoWidth || 0;
    const vidH = video.videoHeight || 0;
    let ox = 0;
    let oy = 0;
    let dw = cssW;
    let dh = cssH;
    if (vidW > 0 && vidH > 0) {
      const scale = Math.min(cssW / vidW, cssH / vidH);
      dw = vidW * scale;
      dh = vidH * scale;
      ox = (cssW - dw) / 2;
      oy = (cssH - dh) / 2;
    }

    ctx.lineWidth = 2;
    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    for (const box of boxesRef.current) {
      const color = BOX_COLORS[box.state || 'verifying'] || BOX_COLORS.verifying;
      const x = ox + box.x1 * dw;
      const y = oy + box.y1 * dh;
      const w = (box.x2 - box.x1) * dw;
      const h = (box.y2 - box.y1) * dh;
      ctx.strokeStyle = color;
      ctx.strokeRect(x, y, w, h);
      const label = box.name || box.state || '';
      if (label) {
        const pad = 4;
        const textW = ctx.measureText(label).width;
        ctx.fillStyle = color;
        ctx.fillRect(x, Math.max(0, y - 18), textW + pad * 2, 18);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, x + pad, Math.max(12, y - 5));
      }
    }
  }, [enableAi, showBbox]);

  useEffect(() => {
    if (!socket || !cameraId) return;
    const apply = (data: { camera_id?: string; boxes?: OverlayBox[] }) => {
      if (!data || data.camera_id !== cameraId) return;
      boxesRef.current = data.boxes || [];
      drawBoxes();
    };
    const clear = (data: { camera_id?: string }) => {
      if (!data || data.camera_id !== cameraId) return;
      boxesRef.current = [];
      drawBoxes();
    };
    socket.on('vision.person.entered', apply);
    socket.on('vision.person.update', apply);
    socket.on('vision.person.left', clear);
    return () => {
      socket.off('vision.person.entered', apply);
      socket.off('vision.person.update', apply);
      socket.off('vision.person.left', clear);
    };
  }, [socket, cameraId, drawBoxes]);

  useEffect(() => {
    if (!showBbox || !enableAi) {
      boxesRef.current = [];
      drawBoxes();
    } else {
      drawBoxes();
    }
  }, [showBbox, enableAi, drawBoxes]);

  useEffect(() => {
    const wrap = overlayWrapRef.current;
    if (!wrap || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => drawBoxes());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [drawBoxes]);

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

  // ──────────────────────────────────────────────────────────────────────────
  // Lightweight render FPS tracker for Trace monitor
  // ──────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let animationFrameId: number;
    const renderLoop = () => {
      traceStateRef.current.frames++; // Track render FPS
      animationFrameId = requestAnimationFrame(renderLoop);
    };
    renderLoop();
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  // ──────────────────────────────────────────────────────────────────────────
  // WebRTC connection
  // ──────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let pc: RTCPeerConnection | null = null;
    let isActive = true;
    let poolStreamName: string | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

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
        poolStreamName = response.headers.get('X-Pool-Stream-Name');

        if (!isActive) {
          if (poolStreamName) releasePoolStream(cameraId, poolStreamName);
          return;
        }

        if (poolStreamName) {
          heartbeatTimer = setInterval(() => {
            if (!poolStreamName) return;
            axiosClient
              .post(`/live/${cameraId}/heartbeat?stream_name=${encodeURIComponent(poolStreamName)}`)
              .catch(() => {});
          }, 15_000);
        }

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
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (poolStreamName) releasePoolStream(cameraId, poolStreamName);
      stopStatsPoll();
      onLiveStatusChange?.(false);
      if (pc) pc.close();
    };
  }, [cameraId, onLiveStatusChange, t, startStatsPoll, stopStatsPoll]);

  return (
    <div ref={overlayWrapRef} className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden select-none">
      <video
        ref={videoRef}
        controls={false}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-contain pointer-events-none"
      />
      <canvas
        ref={overlayRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-20"
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
      <div className="absolute top-overlay-safe right-overlay-safe z-40 flex items-center gap-2">
        {enableAi && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-950/70 text-purple-200 border border-purple-500/40 backdrop-blur shadow-lg pointer-events-none select-none animate-in fade-in duration-300">
            <Sparkles size={13} className="text-purple-400 animate-spin" style={{ animationDuration: '4s' }} />
            <span>AI Integrated</span>
          </div>
        )}

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
