/**
 * `@hubsight/api/react` — React bindings for the HubSight REST client.
 */
export { HubSightProvider, useHubSight, useHubSightOptional } from './provider';
export type { HubSightProviderProps } from './provider';

// re-export the core surface so consumers can import everything from one path
export * from '../index';
