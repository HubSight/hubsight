import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, AlertCircle, Activity, Volume2, Volume1, VolumeX, Sparkles } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { useSocket } from '../../context/SocketContext';
import axiosClient from '../../api/axiosClient';

const releasePoolStream = (cameraId: string, streamName: string) => {
  const baseUrl = import.meta.env.VITE_API_URL || '/api';
  const url = `${baseUrl}/live/${cameraId}/release?stream_name=${encodeURIComponent(streamName)}`;
  fetch(url, { method: 'POST', credentials: 'include', keepalive: true }).catch(() => { });
};

interface OverlayBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  state?: string;
  name?: string;
  track_id?: number;
  angle_deg?: number | null;
  keypoints?: number[][];
}

const POSE_SKELETON: [number, number][] = [
  [5, 6], [5, 7], [7, 9], [6, 8], [8, 10],
  [5, 11], [6, 12], [11, 12],
  [11, 13], [13, 15], [12, 14], [14, 16],
  [0, 1], [0, 2], [1, 3], [2, 4], [0, 5], [0, 6],
];

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
    const targetW = Math.max(1, Math.round(cssW * dpr));
    const targetH = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
    }
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
    let fallenCount = 0;
    for (const box of boxesRef.current) {
      const color = BOX_COLORS[box.state || 'verifying'] || BOX_COLORS.verifying;
      const x = ox + box.x1 * dw;
      const y = oy + box.y1 * dh;
      const bw = (box.x2 - box.x1) * dw;
      const bh = (box.y2 - box.y1) * dh;
      if (box.state === 'fall') fallenCount += 1;
      ctx.strokeStyle = color;
      ctx.lineWidth = box.state === 'fall' ? 3 : 2;
      ctx.strokeRect(x, y, bw, bh);

      const kpts = box.keypoints;
      if (Array.isArray(kpts) && kpts.length >= 17) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = color;
        for (const [a, b] of POSE_SKELETON) {
          const pa = kpts[a];
          const pb = kpts[b];
          if (!pa || !pb || pa[2] < 0.3 || pb[2] < 0.3) continue;
          ctx.beginPath();
          ctx.moveTo(ox + pa[0] * dw, oy + pa[1] * dh);
          ctx.lineTo(ox + pb[0] * dw, oy + pb[1] * dh);
          ctx.stroke();
        }
        for (const kp of kpts) {
          if (!kp || kp[2] < 0.3) continue;
          ctx.beginPath();
          ctx.fillStyle = color;
          ctx.arc(ox + kp[0] * dw, oy + kp[1] * dh, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const label = box.name || box.state || '';
      if (label) {
        const pad = 4;
        ctx.font = box.state === 'fall' ? 'bold 12px ui-sans-serif, system-ui, sans-serif' : '12px ui-sans-serif, system-ui, sans-serif';
        const textW = ctx.measureText(label).width;
        const ly = Math.max(0, y - 18);
        ctx.fillStyle = color;
        ctx.fillRect(x, ly, textW + pad * 2, 18);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, x + pad, Math.max(12, y - 5));
      }
    }
    if (fallenCount > 0) {
      const banner = `ALERT! ${fallenCount} FALL DETECTED`;
      ctx.font = 'bold 13px ui-sans-serif, system-ui, sans-serif';
      const tw = ctx.measureText(banner).width;
      const bx = Math.max(8, cssW - tw - 28);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(bx, 10, tw + 20, 26);
      ctx.fillStyle = '#fff';
      ctx.fillText(banner, bx + 10, 28);
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
      video.play().catch(() => { });
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
      video.play().catch(() => { });
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
    jitterBufferMs: 0,
    rttMs: 0,
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
    lastPacketsLost: 0,
    initialized: false
  });

  // ──────────────────────────────────────────────────────────────────────────
  // WebRTC Stats Polling
  // ──────────────────────────────────────────────────────────────────────────

  const startStatsPoll = useCallback((video: HTMLVideoElement, pc: RTCPeerConnection) => {
    if (liveEdgeSyncRef.current) clearInterval(liveEdgeSyncRef.current);
    liveEdgeSyncRef.current = setInterval(async () => {
      if (!video || video.paused || video.ended || !pc) return;

      try {
        const statsReport = await pc.getStats();
        let inboundVideo: any = null;
        let localCandidate: any = null;
        let remoteCandidate: any = null;
        let codecInfo: any = null;
        let nominatedPair: any = null;

        statsReport.forEach((stat: any) => {
          if (stat.type === 'inbound-rtp' && stat.kind === 'video') {
            inboundVideo = stat;
            if (inboundVideo.codecId && typeof (statsReport as any).get === 'function') {
              codecInfo = (statsReport as any).get(inboundVideo.codecId);
            }
          }
          if (stat.type === 'candidate-pair' && (stat.state === 'succeeded' || stat.nominated)) {
            nominatedPair = stat;
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

          const quality = typeof video.getVideoPlaybackQuality === 'function' ? video.getVideoPlaybackQuality() : null;
          if (quality) {
            const newDecoded = quality.totalVideoFrames || 0;
            decodeFps = Math.max(0, Math.round(((newDecoded - state.lastDecoded) * 1000) / dt));
            const newDropped = quality.droppedVideoFrames || 0;

            if (!state.initialized) {
              dropped = 0;
              pLost = 0;
              state.initialized = true;
            } else {
              dropped = Math.max(0, newDropped - state.lastDropped);
              if (inboundVideo) {
                const newPacketsLost = inboundVideo.packetsLost || 0;
                pLost = Math.max(0, newPacketsLost - state.lastPacketsLost);
                state.lastPacketsLost = newPacketsLost;
              }
            }
            state.lastDecoded = newDecoded;
            state.lastDropped = newDropped;

            if (inboundVideo) {
              jitter = Math.round((inboundVideo.jitter || 0) * 1000);
            }
          } else if (inboundVideo) {
            const newDecoded = inboundVideo.framesDecoded || 0;
            decodeFps = Math.max(0, Math.round(((newDecoded - state.lastDecoded) * 1000) / dt));

            const newDropped = inboundVideo.framesDropped || 0;
            const newPacketsLost = inboundVideo.packetsLost || 0;

            if (!state.initialized) {
              dropped = 0;
              pLost = 0;
              state.initialized = true;
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

          let jitterBufferMs = 0;
          if (inboundVideo) {
            const jbDelay = inboundVideo.jitterBufferDelay;
            const jbEmitted = inboundVideo.jitterBufferEmittedCount;
            if (typeof jbDelay === 'number' && typeof jbEmitted === 'number' && jbEmitted > 0) {
              jitterBufferMs = Math.round((jbDelay / jbEmitted) * 1000);
            }
          }

          const rttMs = nominatedPair && typeof nominatedPair.currentRoundTripTime === 'number'
            ? Math.round(nominatedPair.currentRoundTripTime * 1000)
            : 0;

          setStats({
            renderFps,
            decodeFps,
            droppedFrames: dropped,
            latencyMs: latency,
            jitterBufferMs,
            rttMs,
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

        // Dedicated stream: lets us keep a silent audio track OUT of the <video>
        // element. Attaching a muted / never-unmuting audio track makes Chrome
        // stall video frames waiting on A/V sync — multi-second lag, green stats.
        const mediaStream = new MediaStream();
        video.srcObject = mediaStream;

        const attachTrack = (track: MediaStreamTrack) => {
          if (!mediaStream.getTracks().includes(track)) mediaStream.addTrack(track);
        };

        // Playout jitter buffer — the WebRTC equivalent of VLC's network cache.
        // go2rtc transcodes + re-paces the live stream (baseline H264), so it
        // arrives smooth; ~0.8s of buffer covers residual TCP/network jitter.
        // Raise toward 1500-2000 for very lossy WAN cameras, 0 to disable.
        const JITTER_BUFFER_MS = 800;
        const applyJitterBuffer = (receiver: RTCRtpReceiver) => {
          if (JITTER_BUFFER_MS <= 0) return;
          const r = receiver as RTCRtpReceiver & { jitterBufferTarget?: number };
          try { r.jitterBufferTarget = JITTER_BUFFER_MS; } catch { /* Safari / older Chromium: ignore */ }
        };

        const handleTrack = (track: MediaStreamTrack) => {
          if (track.kind === 'audio') {
            setHasAudioTrack(true);
            // Only attach audio once it is actually producing samples. A muted
            // track that never unmutes (source has no audio, or non-Opus codec)
            // would freeze the video pipeline on A/V sync.
            if (!track.muted) { attachTrack(track); return; }
            track.addEventListener('unmute', () => attachTrack(track), { once: true });
            return;
          }
          attachTrack(track);
        };

        pc.ontrack = (event) => {
          if (!isActive) return;
          if (event.receiver) applyJitterBuffer(event.receiver);

          if (event.track) handleTrack(event.track);
          event.streams?.[0]?.getTracks().forEach(handleTrack);

          setIsInitializing(false);
          onLiveStatusChange?.(true);

          video.muted = true;
          setIsMuted(true);
          video.play().catch(e => console.warn('Autoplay failed:', e));
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
              .catch(() => { });
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
              <tr>
                <td className="pr-3 text-slate-300">{t('playback.traceJbDelay')}</td>
                <td className={`font-semibold ${stats.jitterBufferMs > 1000 ? 'text-red-400' : stats.jitterBufferMs > 400 ? 'text-orange-400' : 'text-emerald-400'}`}>
                  {stats.jitterBufferMs} ms
                </td>
              </tr>
              <tr>
                <td className="pr-3 text-slate-300">{t('playback.traceRtt')}</td>
                <td className={`font-semibold ${stats.rttMs > 80 ? 'text-orange-400' : 'text-emerald-400'}`}>
                  {stats.rttMs} ms
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
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold backdrop-blur shadow-lg transition-all cursor-pointer border ${showTrace
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
            className="text-xs px-2.5 py-1 bg-white/20 hover:bg-white/30 text-white font-medium rounded-lg border border-white/30 backdrop-blur-md shadow-lg flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
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
