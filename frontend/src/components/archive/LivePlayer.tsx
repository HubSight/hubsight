import React, { useEffect, useRef, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { useSocket } from '../../context/SocketContext';

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
  const [personDetected, setPersonDetected] = useState(false);
  const [boundingBoxes, setBoundingBoxes] = useState<any[]>([]);

  useEffect(() => {
    if (!socket) return;
    
    socket.on('vision.person.entered', (data) => {
      setPersonDetected(true);
      setBoundingBoxes(data.boxes || []);
    });

    socket.on('vision.person.update', (data) => {
      setPersonDetected(true);
      setBoundingBoxes(data.boxes || []);
    });

    socket.on('vision.person.left', () => {
      setPersonDetected(false);
      setBoundingBoxes([]);
    });

    return () => {
      socket.off('vision.person.entered');
      socket.off('vision.person.update');
      socket.off('vision.person.left');
    };
  }, [socket, cameraId]);

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

      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (personDetected && boundingBoxes.length > 0) {
        const videoRatio = video.videoWidth / video.videoHeight;
        const containerRatio = canvas.width / canvas.height;
        
        let drawWidth = canvas.width;
        let drawHeight = canvas.height;
        let offsetX = 0;
        let offsetY = 0;

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

        boundingBoxes.forEach(box => {
          const x = offsetX + (box.x1 * drawWidth);
          const y = offsetY + (box.y1 * drawHeight);
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
  }, [personDetected, boundingBoxes]);

  useEffect(() => {
    let pc: RTCPeerConnection | null = null;
    let isActive = true;

    const initWebRTC = async () => {
      const video = videoRef.current;
      if (!video || !cameraId) {
        onLiveStatusChange?.(false);
        return;
      }

      setIsInitializing(true);
      setStreamError(null);
      onLiveStatusChange?.(false);

      try {
        pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver('audio', { direction: 'recvonly' });

        pc.ontrack = (event) => {
          if (!isActive) return;
          if (event.streams && event.streams[0]) {
            if (video.srcObject !== event.streams[0]) {
              video.srcObject = event.streams[0];
            }
          } else if (event.track) {
            let stream = video.srcObject as MediaStream;
            if (!stream || !(stream instanceof MediaStream)) {
              stream = new MediaStream();
              video.srcObject = stream;
            }
            stream.addTrack(event.track);
          }
          setIsInitializing(false);
          onLiveStatusChange?.(true);
          video.play().catch((err) => {
            console.warn('Autoplay prevented:', err);
          });
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // Wait a brief moment for ICE candidates to gather
        await new Promise<void>((resolve) => {
          if (pc!.iceGatheringState === 'complete') {
            resolve();
          } else {
            const checkState = () => {
              if (pc!.iceGatheringState === 'complete') {
                pc!.removeEventListener('icegatheringstatechange', checkState);
                resolve();
              }
            };
            pc!.addEventListener('icegatheringstatechange', checkState);
            // Timeout after 1 second to avoid waiting forever
            setTimeout(() => {
              pc!.removeEventListener('icegatheringstatechange', checkState);
              resolve();
            }, 1000);
          }
        });

        if (!isActive) return;

        const baseUrl = import.meta.env.VITE_API_URL || '/api';
        const response = await fetch(`${baseUrl}/live/${cameraId}/webrtc`, {
          method: 'POST',
          body: pc.localDescription?.sdp,
          headers: {
            'Content-Type': 'application/sdp',
          },
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error('Failed to negotiate WebRTC with server');
        }

        const answerSdp = await response.text();
        if (!isActive) return;

        await pc.setRemoteDescription(
          new RTCSessionDescription({ type: 'answer', sdp: answerSdp })
        );
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
      onLiveStatusChange?.(false);
      if (pc) {
        pc.close();
      }
    };
  }, [cameraId, onLiveStatusChange, t]);

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black">
      <video
        ref={videoRef}
        controls={false}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-contain"
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
