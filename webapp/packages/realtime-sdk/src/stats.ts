import { EMPTY_LIVE_STATS, type LiveStats } from './types';

/**
 * Polls `RTCPeerConnection.getStats()` once a second and reports a flat, UI-ready
 * {@link LiveStats} snapshot. Render FPS is measured from actually-painted video
 * frames (`requestVideoFrameCallback`, falling back to `requestAnimationFrame`).
 *
 * Ported verbatim from the old `LivePlayer` `startStatsPoll`.
 */
export interface StatsPoller {
  stop(): void;
}

type RVFC = {
  requestVideoFrameCallback(cb: () => void): number;
  cancelVideoFrameCallback(handle: number): void;
};
const hasRVFC = (v: HTMLVideoElement): v is HTMLVideoElement & RVFC =>
  typeof (v as Partial<RVFC>).requestVideoFrameCallback === 'function';

export function createStatsPoller(
  pc: RTCPeerConnection,
  video: HTMLVideoElement,
  onStats: (stats: LiveStats) => void,
  intervalMs = 1000,
): StatsPoller {
  let stopped = false;

  // ── render-fps counter ──────────────────────────────────────────────────────
  let frames = 0;
  let rafId = 0;
  let rvfcId = 0;
  if (hasRVFC(video)) {
    const tick = () => {
      if (stopped) return;
      frames++;
      rvfcId = video.requestVideoFrameCallback(tick);
    };
    rvfcId = video.requestVideoFrameCallback(tick);
  } else if (typeof requestAnimationFrame === 'function') {
    const loop = () => {
      if (stopped) return;
      frames++;
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
  }

  // ── delta state ─────────────────────────────────────────────────────────────
  let lastTime = performance.now();
  let lastDecoded = 0;
  let lastDropped = 0;
  let lastPacketsLost = 0;
  let initialized = false;

  const timer = setInterval(() => {
    void poll();
  }, intervalMs);

  async function poll(): Promise<void> {
    if (stopped || video.paused || video.ended) return;
    let report: RTCStatsReport;
    try {
      report = await pc.getStats();
    } catch {
      return;
    }

    let inbound: Record<string, number> | undefined;
    let codecStat: Record<string, string> | undefined;
    let nominatedPair: Record<string, number> | undefined;
    let localCandidate: Record<string, string> | undefined;
    let remoteCandidate: Record<string, string> | undefined;

    report.forEach((stat: Record<string, unknown>) => {
      if (stat.type === 'inbound-rtp' && stat.kind === 'video') {
        inbound = stat as unknown as Record<string, number>;
        const codecId = stat.codecId as string | undefined;
        if (codecId) codecStat = report.get(codecId) as unknown as Record<string, string>;
      }
      if (stat.type === 'candidate-pair' && (stat.state === 'succeeded' || stat.nominated)) {
        nominatedPair = stat as unknown as Record<string, number>;
        const l = stat.localCandidateId as string | undefined;
        const r = stat.remoteCandidateId as string | undefined;
        if (l) localCandidate = report.get(l) as unknown as Record<string, string>;
        if (r) remoteCandidate = report.get(r) as unknown as Record<string, string>;
      }
    });

    const now = performance.now();
    const dt = now - lastTime;
    if (dt < intervalMs) return;

    const out: LiveStats = { ...EMPTY_LIVE_STATS };
    out.renderFps = Math.round((frames * 1000) / dt);
    frames = 0;

    const quality =
      typeof video.getVideoPlaybackQuality === 'function' ? video.getVideoPlaybackQuality() : null;

    if (quality) {
      const newDecoded = quality.totalVideoFrames || 0;
      out.decodeFps = Math.max(0, Math.round(((newDecoded - lastDecoded) * 1000) / dt));
      const newDropped = quality.droppedVideoFrames || 0;
      if (!initialized) {
        initialized = true;
      } else {
        out.droppedFrames = Math.max(0, newDropped - lastDropped);
        if (inbound) {
          const newLost = inbound.packetsLost || 0;
          out.packetsLost = Math.max(0, newLost - lastPacketsLost);
          lastPacketsLost = newLost;
        }
      }
      lastDecoded = newDecoded;
      lastDropped = newDropped;
    } else if (inbound) {
      const newDecoded = inbound.framesDecoded || 0;
      out.decodeFps = Math.max(0, Math.round(((newDecoded - lastDecoded) * 1000) / dt));
      const newDropped = inbound.framesDropped || 0;
      const newLost = inbound.packetsLost || 0;
      if (!initialized) {
        initialized = true;
      } else {
        out.droppedFrames = Math.max(0, newDropped - lastDropped);
        out.packetsLost = Math.max(0, newLost - lastPacketsLost);
      }
      lastDecoded = newDecoded;
      lastDropped = newDropped;
      lastPacketsLost = newLost;
    }

    if (inbound) {
      out.jitter = Math.round((inbound.jitter || 0) * 1000);
      const jbDelay = inbound.jitterBufferDelay;
      const jbEmitted = inbound.jitterBufferEmittedCount;
      if (typeof jbDelay === 'number' && typeof jbEmitted === 'number' && jbEmitted > 0) {
        out.jitterBufferMs = Math.round((jbDelay / jbEmitted) * 1000);
      }
    }

    if (codecStat?.mimeType) out.codec = codecStat.mimeType.split('/')[1] || 'Unknown';
    const proto = localCandidate?.protocol || remoteCandidate?.protocol;
    if (proto) out.protocol = proto.toUpperCase();

    if (video.buffered.length > 0) {
      out.latencyMs = Math.round(
        (video.buffered.end(video.buffered.length - 1) - video.currentTime) * 1000,
      );
    }
    if (nominatedPair && typeof nominatedPair.currentRoundTripTime === 'number') {
      out.rttMs = Math.round(nominatedPair.currentRoundTripTime * 1000);
    }
    out.resolution = `${video.videoWidth}x${video.videoHeight}`;

    lastTime = now;
    onStats(out);
  }

  return {
    stop() {
      stopped = true;
      clearInterval(timer);
      if (rafId && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId);
      if (rvfcId && hasRVFC(video)) video.cancelVideoFrameCallback(rvfcId);
    },
  };
}
