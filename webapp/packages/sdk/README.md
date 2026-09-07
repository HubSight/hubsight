# @hubsight/sdk

Unified, tree-shakable TypeScript SDK for the HubSight surveillance and playback platform.

## Features

- **Tree-Shakable Subpath Exports**: Import only what you need (`/client`, `/auth`, `/realtime`, `/media`, `/resources`, `/errors`, `/types`, `/react`). Unused modules and dependencies (such as Socket.IO or WebRTC) are dropped from production bundles.
- **Lightweight `createBaseClient`**: Minimal HTTP + Auth client (~5KB). Zero Socket.IO or WebRTC footprint.
- **Standalone Functional API**: Pure tree-shakable functions (`listCameras(client)`, `createCamera(client, data)`, `getTimeline(client, params)`).
- **Unified Client (`createHubSightClient`)**: All-in-one client with lazy getters for batteries-included convenience.
- **Zero Leakage**: Strict encapsulation around Axios and Socket.IO. Strongly typed error hierarchy.
- **React Hooks & Provider (`@hubsight/sdk/react`)**: Ready-to-use hooks (`useAuth`, `useRealtimeStatus`, `useLiveStream`, `useOnNotification`, etc.) powered by `<HubSightProvider>`.

## Installation

```bash
pnpm add @hubsight/sdk
```

## Subpath Imports (Tree-Shakable)

| Subpath | Description |
| :--- | :--- |
| `@hubsight/sdk` | Root entrypoint (all-in-one client + errors + types) |
| `@hubsight/sdk/client` | `createBaseClient` (lightweight) & `createHubSightClient` |
| `@hubsight/sdk/resources` | Pure standalone functions (`listCameras`, `getTimeline`, ...) & resource factories |
| `@hubsight/sdk/auth` | `createAuthManager`, session storage adapters, PWA helpers (`isPwa`, `getPwaRefreshToken`, ...) |
| `@hubsight/sdk/realtime` | `createRealtimeManager`, typed Socket.IO event listeners |
| `@hubsight/sdk/media` | `createMediaManager`, WebRTC session & stream stats |
| `@hubsight/sdk/errors` | Error classes (`HubSightError`, `HubSightApiError`) and typeguards (`isApiError`, `toApiError`) |
| `@hubsight/sdk/types` | TypeScript domain types and wire interfaces (0 byte JS runtime) |
| `@hubsight/sdk/react` | `<HubSightProvider>` and React hooks (`useLiveStream`, `useAuth`, ...) |

---

## Usage Examples

### 1. Minimal Tree-Shakable Usage (Lowest Bundle Size)

```typescript
import { createBaseClient } from '@hubsight/sdk/client';
import { listCameras, getCamera } from '@hubsight/sdk/resources';

// Initializes only HTTP transport and Auth state (no Socket.IO, no WebRTC engine)
const client = createBaseClient({
  baseUrl: 'http://localhost:8088/api',
});

// Standalone functions tree-shake any unimported resources
const cameras = await listCameras(client);
const frontCam = await getCamera(client, 'cam_front');
```

### 2. All-in-One Client (Convenience)

```typescript
import { createHubSightClient } from '@hubsight/sdk';

const client = createHubSightClient({
  baseUrl: 'http://localhost:8088/api',
});

// REST Resources (lazy initialized on first property access)
const cameras = await client.cameras.list();

// Realtime Events
const unsub = client.realtime.onNotification((notif) => {
  console.log('New alert:', notif.title);
});

client.destroy();
```

### 3. React Integration

```tsx
import React from 'react';
import { HubSightProvider, useOnNotification, useLiveStream } from '@hubsight/sdk/react';
import { api } from './api';

export function App() {
  return (
    <HubSightProvider client={api}>
      <Dashboard />
    </HubSightProvider>
  );
}

function Dashboard() {
  useOnNotification((notification) => {
    console.log('Notification received:', notification);
  });

  const { videoRef, status } = useLiveStream('cam_front');

  return (
    <div>
      <div>Status: {status}</div>
      <video ref={videoRef} autoPlay playsInline muted />
    </div>
  );
}
```
