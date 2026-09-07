# @hubsight/sdk

Unified standard TypeScript SDK for HubSight surveillance and playback platform.

## Features

- **Unified Client (`createHubSightClient`)**: Single entrypoint providing cohesive access to Auth, Realtime, Media, and REST domain resources (`cameras`, `devices`, `members`, `notifications`, `archive`, `access`, `pool`, `recorder`).
- **Encapsulated HTTP**: Zero leaking of raw Axios or fetch implementation details. Typed error classes (`HubSightError`, `HubSightApiError`, `AuthenticationError`, `ForbiddenError`, `NotFoundError`, etc.).
- **Auth Lifecycle Management**: Standard session handling, auto refresh token management, PWA standalone mode persistence (`LocalStorageSessionAdapter`, `MemorySessionAdapter`).
- **Realtime Event Bus**: Encapsulated Socket.IO client with 12 typed event handlers (`onNotification`, `onForceLogout`, `onVision`, `onCameraStopped`, `onPoolStatus`, etc.).
- **WebRTC Live Streaming**: High-level stream session lifecycle without leaking `RTCPeerConnection`. Dynamic bitrate and FPS telemetry tracking.
- **React Hooks & Provider (`@hubsight/sdk/react`)**: Ready-to-use hooks (`useAuth`, `useRealtimeStatus`, `useLiveStream`, `useOnNotification`, etc.) powered by `<HubSightProvider>`.

## Installation

```bash
pnpm add @hubsight/sdk
```

## Quick Start

### Basic Client Setup

```typescript
import { createHubSightClient } from '@hubsight/sdk';

const client = createHubSightClient({
  baseUrl: 'http://localhost:8088/api',
});

// REST Resources
const cameras = await client.cameras.list();

// Realtime Events
const unsub = client.realtime.onNotification((notif) => {
  console.log('New notification:', notif.title);
});

// Clean up
client.destroy();
```

### React Usage

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
