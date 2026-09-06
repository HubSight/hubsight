import { io, type Socket } from 'socket.io-client';
import { RELAY_PATH, resolveSocketOrigin } from './config';
import type { RealtimeEventMap, RealtimeEventName } from './types';

export interface RealtimeClientOptions {
  /** REST API base (e.g. `/api`). The socket origin is derived by stripping `/api`. */
  baseUrl?: string;
  /** Send cookies on the handshake. Default `true` (HubSight auth is cookie-based). */
  withCredentials?: boolean;
  /** Optional bearer token, for non-cookie contexts (native apps, tests). */
  token?: string | (() => string | undefined | null);
  /** Connect immediately. Default `true`. */
  autoConnect?: boolean;
  /** Extra socket.io-client options, merged last. */
  socketOptions?: Parameters<typeof io>[1];
}

export type Unsubscribe = () => void;
export type ConnectionListener = (connected: boolean) => void;

export interface RealtimeClient {
  /** The underlying socket.io-client instance (escape hatch). */
  readonly socket: Socket;
  /** Whether the socket is currently connected. */
  isConnected(): boolean;
  /** Subscribe to a typed relay event. Returns an unsubscribe fn. */
  on<E extends RealtimeEventName>(
    event: E,
    handler: (payload: RealtimeEventMap[E]) => void,
  ): Unsubscribe;
  /** Fire on connect/disconnect. Returns an unsubscribe fn. */
  onConnectionChange(listener: ConnectionListener): Unsubscribe;
  connect(): void;
  disconnect(): void;
  /** Disconnect and drop all listeners. */
  close(): void;
}

function readToken(token: RealtimeClientOptions['token']): string | undefined {
  const v = typeof token === 'function' ? token() : token;
  return v ? v : undefined;
}

/**
 * Create the realtime event bus. Mirrors the old `SocketContext` connection:
 * `io(origin || '/', { path: '/relay', transports: ['websocket'], withCredentials: true })`.
 */
export function createRealtimeClient(options: RealtimeClientOptions = {}): RealtimeClient {
  const {
    baseUrl,
    withCredentials = true,
    token,
    autoConnect = true,
    socketOptions,
  } = options;

  const origin = resolveSocketOrigin(baseUrl);
  const tok = readToken(token);

  const socket: Socket = io(origin, {
    path: RELAY_PATH,
    transports: ['websocket'],
    withCredentials,
    autoConnect,
    ...(tok ? { auth: { token: tok } } : {}),
    ...socketOptions,
  });

  const connChange = new Set<ConnectionListener>();
  const emitConn = (connected: boolean) => {
    for (const l of connChange) {
      try {
        l(connected);
      } catch {
        /* listener errors must not break the bus */
      }
    }
  };
  socket.on('connect', () => emitConn(true));
  socket.on('disconnect', () => emitConn(false));

  return {
    socket,
    isConnected: () => socket.connected,

    on<E extends RealtimeEventName>(event: E, handler: (payload: RealtimeEventMap[E]) => void) {
      const wrapped = (payload: RealtimeEventMap[E]) => handler(payload);
      socket.on(event as string, wrapped as (...args: unknown[]) => void);
      return () => {
        socket.off(event as string, wrapped as (...args: unknown[]) => void);
      };
    },

    onConnectionChange(listener: ConnectionListener) {
      connChange.add(listener);
      return () => connChange.delete(listener);
    },

    connect: () => {
      socket.connect();
    },
    disconnect: () => {
      socket.disconnect();
    },
    close: () => {
      connChange.clear();
      socket.removeAllListeners();
      socket.disconnect();
    },
  };
}
