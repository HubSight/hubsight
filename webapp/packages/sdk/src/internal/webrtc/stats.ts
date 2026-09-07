import { EMPTY_LIVE_STATS, type LiveStreamStats } from '../../media/types';

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
  onStats: (stats: LiveStreamStats) => void,
  intervalMs = 1000,
): StatsPoller {
  let stopped = false;

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
      if (stat['type'] === 'inbound-rtp' && stat['kind'] === 'video') {
        inbound = stat as unknown as Record<string, number>;
        const codecId = stat['codecId'] as string | undefined;
        if (codecId) codecStat = report.get(codecId) as unknown as Record<string, string>;
      }
      if (stat['type'] === 'candidate-pair' && (stat['state'] === 'succeeded' || stat['nominated'])) {
        nominatedPair = stat as unknown as Record<string, number>;
        const l = stat['localCandidateId'] as string | undefined;
        const r = stat['remoteCandidateId'] as string | undefined;
        if (l) localCandidate = report.get(l) as unknown as Record<string, string>;
        if (r) remoteCandidate = report.get(r) as unknown as Record<string, string>;
      }
    });

    const now = performance.now();
    const dt = now - lastTime;
    if (dt < intervalMs) return;

    const out: LiveStreamStats = { ...EMPTY_LIVE_STATS };
    out.renderFps = Math.round((frames * 1000) / dt);
    frames = 0;

    const quality =
      typeof video.getVideoPlaybackQuality === 'function' ? video.getVideoPlaybackQuality() : null;

    if (inbound) {
      const decoded = inbound['framesDecoded'] ?? 0;
      const dropped = quality ? quality.droppedVideoFrames : (inbound['framesDropped'] ?? 0);
      const lost = inbound['packetsLost'] ?? 0;

      if (initialized) {
        out.decodeFps = Math.max(0, Math.round(((decoded - lastDecoded) * 1000) / dt));
        out.droppedFrames = Math.max(0, dropped - lastDropped);
        out.packetsLost = Math.max(0, lost - lastPacketsLost);
      } else {
        initialized = true;
      }
      lastDecoded = decoded;
      lastDropped = dropped;
      lastPacketsLost = lost;

      out.jitter = Number(((inbound['jitter'] ?? 0) * 1000).toFixed(1));
      const jbDelay = inbound['jitterBufferDelay'] ?? 0;
      const jbEmitted = inbound['jitterBufferEmittedCount'] ?? 1;
      out.jitterBufferMs = Math.round((jbDelay / Math.max(1, jbEmitted)) * 1000);

      const w = inbound['frameWidth'];
      const h = inbound['frameHeight'];
      if (w && h) {
        out.resolution = `${w}x${h}`;
      }
    }

    if (video.videoWidth && video.videoHeight) {
      out.resolution = `${video.videoWidth}x${video.videoHeight}`;
    }

    if (nominatedPair) {
      const rtt = nominatedPair['currentRoundTripTime'];
      if (typeof rtt === 'number') {
        out.rttMs = Math.round(rtt * 1000);
      }
    }

    if (localCandidate && remoteCandidate) {
      const lp = localCandidate['protocol'] ?? '';
      const lt = localCandidate['candidateType'] ?? '';
      const rt = remoteCandidate['candidateType'] ?? '';
      out.protocol = `${lp.toUpperCase()} (${lt}->${rt})`;
    }

    if (codecStat) {
      const mime = codecStat['mimeType'] ?? '';
      out.codec = mime.replace(/^video\//i, '').toUpperCase();
    }

    lastTime = now;
    onStats(out);
  }

  return {
    stop(): void {
      stopped = true;
      clearInterval(timer);
      if (hasRVFC(video) && rvfcId) {
        video.cancelVideoFrameCallback(rvfcId);
      } else if (rafId) {
        cancelAnimationFrame(rafId);
      }
    },
  };
}

