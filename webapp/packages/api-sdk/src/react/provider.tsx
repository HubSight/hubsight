import { createContext, createElement, useContext, useMemo, type ReactNode } from 'react';
import { createHubSightClient, type HubSightClient, type HubSightClientOptions } from '../client';

const HubSightContext = createContext<HubSightClient | null>(null);

export interface HubSightProviderProps extends HubSightClientOptions {
  children: ReactNode;
  /** Provide a pre-built client instead of letting the provider create one. */
  client?: HubSightClient;
}

/**
 * Makes one {@link HubSightClient} available to the tree via {@link useHubSight}.
 * The client is stateless (a thin axios wrapper), so it is memoised on the
 * connection-defining options and never torn down.
 */
export function HubSightProvider({ children, client, ...options }: HubSightProviderProps) {
  const key = JSON.stringify({
    baseUrl: options.baseUrl,
    withCredentials: options.withCredentials,
  });

  const value = useMemo<HubSightClient>(
    () => client ?? createHubSightClient(options),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, key],
  );

  return createElement(HubSightContext.Provider, { value }, children);
}

/** The app-wide HubSight REST client. Throws if no {@link HubSightProvider} is mounted. */
export function useHubSight(): HubSightClient {
  const client = useContext(HubSightContext);
  if (!client) {
    throw new Error('useHubSight must be used within a <HubSightProvider>');
  }
  return client;
}

/** Like {@link useHubSight} but returns `null` instead of throwing. */
export function useHubSightOptional(): HubSightClient | null {
  return useContext(HubSightContext);
}
