import { io, type Socket } from 'socket.io-client';
import { RELAY_PATH, resolveSocketOrigin } from '../../config';
import type {
  InternalSocketClient,
  SocketState,
  SocketStateListener,
  Unsubscribe,
} from './types';

export interface CreateSocketClientOptions {
  baseUrl?: string;
  withCredentials?: boolean;
  autoConnect?: boolean;
  token?: string | (() => string | undefined | null);
}

export function createInternalSocketClient(
  options: CreateSocketClientOptions = {},
): InternalSocketClient {
  const {
    baseUrl,
    withCredentials = true,
    autoConnect = true,
    token,
  } = options;

  const origin = resolveSocketOrigin(baseUrl);
  const readToken = () => (typeof token === 'function' ? token() : token);
  const initialToken = readToken();

  let state: SocketState = 'disconnected';
  const listeners = new Set<SocketStateListener>();

  const setState = (next: SocketState) => {
    if (state === next) return;
    state = next;
    for (const listener of listeners) {
      try {
        listener(next);
      } catch {
        /* ignore */
      }
    }
  };

  const socket: Socket = io(origin || '/', {
    path: RELAY_PATH,
    transports: ['websocket'],
    withCredentials,
    autoConnect,
    ...(initialToken ? { auth: { token: initialToken } } : {}),
  });

  socket.on('connect', () => setState('connected'));
  socket.on('disconnect', (reason) => {
    setState(reason === 'io client disconnect' ? 'disconnected' : 'reconnecting');
  });
  socket.on('connect_error', () => setState('error'));

  return {
    connect(): void {
      if (!socket.connected) {
        setState('connecting');
        socket.connect();
      }
    },

    disconnect(): void {
      socket.disconnect();
      setState('disconnected');
    },

    close(): void {
      listeners.clear();
      socket.removeAllListeners();
      socket.disconnect();
      setState('disconnected');
    },

    isConnected(): boolean {
      return socket.connected;
    },

    getState(): SocketState {
      return state;
    },

    onStateChange(listener: SocketStateListener): Unsubscribe {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    on(event: string, handler: (payload: unknown) => void): Unsubscribe {
      const wrapped = (data: unknown) => {
        try {
          handler(data);
        } catch {
          /* ignore subscriber failure */
        }
      };
      socket.on(event, wrapped);
      return () => {
        socket.off(event, wrapped);
      };
    },

    emit(event: string, data?: unknown): void {
      socket.emit(event, data);
    },
  };
}

