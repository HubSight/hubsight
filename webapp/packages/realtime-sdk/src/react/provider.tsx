import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createRealtimeClient, type RealtimeClient, type RealtimeClientOptions } from '../client';

interface RealtimeContextValue {
  client: RealtimeClient | null;
  connected: boolean;
  /** The API base the provider was created with — hooks default to this. */
  baseUrl: string | undefined;
}

const RealtimeContext = createContext<RealtimeContextValue>({
  client: null,
  connected: false,
  baseUrl: undefined,
});

export interface RealtimeProviderProps extends RealtimeClientOptions {
  children: ReactNode;
}

/**
 * Owns a single realtime connection for the app lifetime. Drop-in replacement for
 * the old `<SocketProvider>`.
 */
export function RealtimeProvider({ children, ...options }: RealtimeProviderProps) {
  const [client, setClient] = useState<RealtimeClient | null>(null);
  const [connected, setConnected] = useState(false);

  // Only re-create the connection when connection-defining options change.
  const optsRef = useRef(options);
  optsRef.current = options;
  const key = JSON.stringify({
    baseUrl: options.baseUrl,
    withCredentials: options.withCredentials,
    autoConnect: options.autoConnect,
  });

  useEffect(() => {
    const c = createRealtimeClient(optsRef.current);
    setClient(c);
    setConnected(c.isConnected());
    const off = c.onConnectionChange(setConnected);
    return () => {
      off();
      c.close();
      setClient(null);
      setConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const value = useMemo<RealtimeContextValue>(
    () => ({ client, connected, baseUrl: options.baseUrl }),
    [client, connected, options.baseUrl],
  );

  return createElement(RealtimeContext.Provider, { value }, children);
}

export function useRealtimeContext(): RealtimeContextValue {
  return useContext(RealtimeContext);
}
