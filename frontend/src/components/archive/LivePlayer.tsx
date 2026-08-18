import React, { useEffect, useRef, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';

interface LivePlayerProps {
  cameraId: number;
  onLiveStatusChange?: (isLive: boolean) => void;
}

export const LivePlayer: React.FC<LivePlayerProps> = ({ cameraId, onLiveStatusChange }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [streamError, setStreamError] = useState<string | null>(null);

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
          if (video.srcObject !== event.streams[0]) {
            video.srcObject = event.streams[0];
            setIsInitializing(false);
            onLiveStatusChange?.(true);
            video.play().catch(() => {});
          }
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
        setStreamError('Unable to connect to live camera stream via WebRTC.');
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
  }, [cameraId, onLiveStatusChange]);

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

      {isInitializing && !streamError && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center gap-3 text-white z-10">
          <Loader2 className="animate-spin text-orange-500" size={36} />
          <p className="text-sm font-medium">Connecting to WebRTC live feed...</p>
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
