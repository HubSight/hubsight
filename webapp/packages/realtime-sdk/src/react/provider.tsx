import { type ReactNode } from 'react';
import { HubSightProvider, useHubSightOptional, type HubSightProviderProps } from '@hubsight/sdk/react';

export interface RealtimeProviderProps extends HubSightProviderProps {
  children: ReactNode;
}

/**
 * Legacy RealtimeProvider bridged to unified HubSightProvider.
 */
export function RealtimeProvider(props: RealtimeProviderProps) {
  return <HubSightProvider {...props} />;
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
