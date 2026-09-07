import { useEffect, useRef, useState } from 'react';
import type { RealtimeEventMap, RealtimeEventName } from '../realtime/events';
import type { RealtimeStatus } from '../realtime/types';
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
 * Subscribes to a strongly-typed realtime relay event.
 * Automatically cleans up subscription on unmount.
 */
export function useRealtimeEvent<E extends RealtimeEventName>(
  event: E,
  handler: (payload: RealtimeEventMap[E]) => void,
  _deps?: unknown[],
): void {
  const client = useHubSight();
  const realtime = client.realtime;

  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const unsub = realtime.on(event, (payload) => {
      handlerRef.current(payload);
    });

    return () => {
      unsub();
    };
  }, [realtime, event]);
}
