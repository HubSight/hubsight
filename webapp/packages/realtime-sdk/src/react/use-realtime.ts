import { useEffect, useRef } from 'react';
import type { RealtimeClient } from '../client';
import type { RealtimeEventMap, RealtimeEventName } from '../types';
import { useRealtimeContext } from './provider';

/** The realtime client, or `null` before the provider has connected. */
export function useRealtime(): RealtimeClient | null {
  return useRealtimeContext().client;
}

/** `true` while the relay socket is connected. */
export function useRealtimeConnection(): boolean {
  return useRealtimeContext().connected;
}

/**
 * Subscribe to a relay event for the lifetime of the component. The handler is
 * kept in a ref so passing an inline function does not re-subscribe; pass `deps`
 * only if the *event name* or a guard captured in the handler must force a reset.
 *
 * Replaces the repeated
 *   `const { socket } = useSocket();
 *    useEffect(() => { socket.on(E, h); return () => socket.off(E, h) }, [socket, ...])`
 */
export function useRealtimeEvent<E extends RealtimeEventName>(
  event: E,
  handler: (payload: RealtimeEventMap[E]) => void,
  deps: ReadonlyArray<unknown> = [],
): void {
  const client = useRealtime();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!client) return;
    const off = client.on(event, (payload) => handlerRef.current(payload));
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, event, ...deps]);
}
