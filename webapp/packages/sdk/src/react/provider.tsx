import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { createHubSightClient, type HubSightClient, type HubSightClientOptions } from '../client';

const HubSightContext = createContext<HubSightClient | null>(null);

export interface HubSightProviderProps extends HubSightClientOptions {
  children: ReactNode;
  /** Pass an existing client instance instead of creating one */
  client?: HubSightClient;
}

/**
 * Unified HubSight React Provider.
 * Provides the single HubSightClient instance (managing Auth, Realtime, Media, and REST)
 * to the component tree.
 */
export function HubSightProvider({
  children,
  client: providedClient,
  ...options
}: HubSightProviderProps) {
  const optionsKey = JSON.stringify({
    baseUrl: options.baseUrl,
    withCredentials: options.withCredentials,
    autoConnectRealtime: options.autoConnectRealtime,
  });

  const client = useMemo<HubSightClient>(() => {
    if (providedClient) return providedClient;
    return createHubSightClient(options);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providedClient, optionsKey]);

  useEffect(() => {
    return () => {
      // If client was created internally by the provider, tear it down on unmount
      if (!providedClient) {
        client.destroy();
      }
    };
  }, [client, providedClient]);

  return createElement(HubSightContext.Provider, { value: client }, children);
}

/**
 * Retrieves the app-wide HubSightClient from context.
 * Throws an error if used outside <HubSightProvider>.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useHubSight(): HubSightClient {
  const client = useContext(HubSightContext);
  if (!client) {
    throw new Error('useHubSight must be used within a <HubSightProvider>');
  }
  return client;
}

/**
 * Like useHubSight, but returns null instead of throwing when unmounted.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useHubSightOptional(): HubSightClient | null {
  return useContext(HubSightContext);
}

export interface RealtimeProviderProps extends HubSightProviderProps {
  children: ReactNode;
}

/**
 * Legacy RealtimeProvider bridged to unified HubSightProvider.
 */
export function RealtimeProvider(props: RealtimeProviderProps) {
  return createElement(HubSightProvider, props);
}

/**
 * Legacy useRealtimeContext helper for backward compatibility.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useRealtimeContext() {
  const client = useHubSightOptional();
  return {
    client: client?.realtime ?? null,
    connected: client?.realtime.isConnected() ?? false,
    baseUrl: client?.baseUrl,
  };
}
