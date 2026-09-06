# @hubsight/realtime

Realtime SDK for HubSight — the Socket.IO relay event bus and the WebRTC live
streaming client, extracted from the webapp so they can be reused and versioned
independently.

- **`@hubsight/realtime`** — framework-agnostic core (works in any browser JS).
- **`@hubsight/realtime/react`** — React provider + hooks.

`socket.io-client` is a peer dependency; `react` / `react-dom` are optional peers
(only needed for the `/react` entry).

## Core

```ts
import { createRealtimeClient, startLiveStream } from '@hubsight/realtime';

const rt = createRealtimeClient({ baseUrl: '/api' }); // socket → <origin>/relay
const off = rt.on('notification.new', (n) => console.log(n.title));
// ...
off();
rt.close();

const stream = startLiveStream({
  cameraId,
  video: document.querySelector('video')!,
  baseUrl: '/api',
  jitterBufferMs: 800,
  onStatus: (s) => console.log(s), // connecting | live | error | closed
  onStats: (s) => console.log(s.decodeFps, s.rttMs),
});
// on teardown — releases the pool lease, closes the PeerConnection:
stream.close();
```

## React

```tsx
import {
  RealtimeProvider,
  useRealtimeEvent,
  useRealtimeConnection,
  useLiveStream,
} from '@hubsight/realtime/react';

<RealtimeProvider baseUrl={import.meta.env.VITE_API_URL}>{app}</RealtimeProvider>;

// subscribe (auto cleanup; inline handler is fine)
useRealtimeEvent('vision.log.new', (log) => setLogs((p) => [log, ...p]), [/* deps */]);

// live view
function Live({ cameraId }: { cameraId: string }) {
  const { videoRef, status, stats } = useLiveStream(cameraId, { withStats: true });
  return <video ref={videoRef} autoPlay playsInline muted />;
}
```

## Events

`vision.person.entered` · `vision.person.update` · `vision.person.left` ·
`vision.log.new` · `member.face.updated` · `notification.new` ·
`pool.status.update` · `nvr.status.update` · `camera.stopped` · `camera.started` ·
`camera.updated`. Payload types are exported from the package root.

## Server contract

- Socket.IO: `<origin>/relay`, `transports: ['websocket']`, cookie auth
  (`withCredentials`). `<origin>` = `baseUrl` with a trailing `/api` removed.
- Live signaling: `POST {baseUrl}/live/:id/webrtc` (`Content-Type: application/sdp`,
  offer SDP body → answer SDP text + `X-Pool-Stream-Name` header), then
  `POST {baseUrl}/live/:id/heartbeat?stream_name=…` every 15s and
  `POST {baseUrl}/live/:id/release?stream_name=…` (keepalive) on close.
