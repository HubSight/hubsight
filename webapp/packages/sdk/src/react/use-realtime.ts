import { useEffect, useRef, useState } from 'react';
import type {
  NotificationItem,
  NvrStatusResponse,
  PoolStatusSummary,
  RecognitionLogItem,
} from '../types';
import type {
  CameraEvent,
  ForceLogoutEvent,
  MemberFaceUpdatedEvent,
  VisionBoxesEvent,
} from '../realtime/events';
import type {
  RealtimeManager,
  RealtimeStatus,
  RealtimeStatusListener,
  Unsubscribe,
} from '../realtime/types';
import { useHubSight } from './provider';

export interface UseRealtimeStatusResult {
  isConnected: boolean;
  status: RealtimeStatus;
}

/**
 * Subscribes to the realtime connection status.
 */
export function useRealtimeStatus(): UseRealtimeStatusResult {
  const client = useHubSight();
  const realtime = client.realtime;

  const [status, setStatus] = useState<RealtimeStatus>(realtime.status);
  const [isConnected, setIsConnected] = useState<boolean>(realtime.isConnected());

  useEffect(() => {
    setStatus(realtime.status);
    setIsConnected(realtime.isConnected());

    const unsub = realtime.onStatusChange((nextStatus) => {
      setStatus(nextStatus);
      setIsConnected(nextStatus === 'connected');
    });

    return () => {
      unsub();
    };
  }, [realtime]);

  return { isConnected, status };
}

/**
 * General realtime subscription helper for custom or composite subscriptions.
 */
export function useRealtimeSubscription(
  subscribe: (realtime: RealtimeManager) => Unsubscribe,
  deps: unknown[] = [],
): void {
  const client = useHubSight();
  const realtime = client.realtime;

  useEffect(() => {
    const unsub = subscribe(realtime);
    return () => {
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realtime, ...deps]);
}

/** Internal helper creating a stable hook for RealtimeManager.on* methods */
function useOn<T>(
  subscribeFn: (realtime: RealtimeManager, callback: (data: T) => void) => Unsubscribe,
  handler: (data: T) => void,
  deps: unknown[] = [],
): void {
  const client = useHubSight();
  const realtime = client.realtime;

  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const unsub = subscribeFn(realtime, (data) => {
      handlerRef.current(data);
    });
    return () => {
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realtime, ...deps]);
}

// ── Strongly-typed prefix "on" Hooks ──────────────────────────────────────────

export function useOnNotification(
  handler: (item: NotificationItem) => void,
  deps?: unknown[],
): void {
  useOn((r, cb) => r.onNotification(cb), handler, deps);
}

export function useOnForceLogout(
  handler: (event: ForceLogoutEvent) => void,
  deps?: unknown[],
): void {
  useOn((r, cb) => r.onForceLogout(cb), handler, deps);
}

export function useOnVision(
  handler: (event: VisionBoxesEvent) => void,
  deps?: unknown[],
): void {
  useOn((r, cb) => r.onVision(cb), handler, deps);
}

export function useOnVisionPersonEntered(
  handler: (event: VisionBoxesEvent) => void,
  deps?: unknown[],
): void {
  useOn((r, cb) => r.onVisionPersonEntered(cb), handler, deps);
}

export function useOnVisionPersonUpdate(
  handler: (event: VisionBoxesEvent) => void,
  deps?: unknown[],
): void {
  useOn((r, cb) => r.onVisionPersonUpdate(cb), handler, deps);
}

export function useOnVisionPersonLeft(
  handler: (event: VisionBoxesEvent) => void,
  deps?: unknown[],
): void {
  useOn((r, cb) => r.onVisionPersonLeft(cb), handler, deps);
}

export function useOnRecognitionLog(
  handler: (item: RecognitionLogItem) => void,
  deps?: unknown[],
): void {
  useOn((r, cb) => r.onRecognitionLog(cb), handler, deps);
}

export function useOnMemberFaceUpdated(
  handler: (event: MemberFaceUpdatedEvent) => void,
  deps?: unknown[],
): void {
  useOn((r, cb) => r.onMemberFaceUpdated(cb), handler, deps);
}

export function useOnPoolStatus(
  handler: (status: PoolStatusSummary) => void,
  deps?: unknown[],
): void {
  useOn((r, cb) => r.onPoolStatus(cb), handler, deps);
}

export function useOnNvrStatus(
  handler: (status: NvrStatusResponse) => void,
  deps?: unknown[],
): void {
  useOn((r, cb) => r.onNvrStatus(cb), handler, deps);
}

export function useOnCamera(
  handler: (event: CameraEvent) => void,
  deps?: unknown[],
): void {
  useOn((r, cb) => r.onCamera(cb), handler, deps);
}

export function useOnCameraStarted(
  handler: (event: CameraEvent) => void,
  deps?: unknown[],
): void {
  useOn((r, cb) => r.onCameraStarted(cb), handler, deps);
}

export function useOnCameraStopped(
  handler: (event: CameraEvent) => void,
  deps?: unknown[],
): void {
  useOn((r, cb) => r.onCameraStopped(cb), handler, deps);
}

export function useOnCameraUpdated(
  handler: (event: CameraEvent) => void,
  deps?: unknown[],
): void {
  useOn((r, cb) => r.onCameraUpdated(cb), handler, deps);
}

export function useOnStatusChange(
  listener: RealtimeStatusListener,
  deps?: unknown[],
): void {
  useOn((r, cb) => r.onStatusChange(cb), listener, deps);
}

