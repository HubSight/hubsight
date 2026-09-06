# @hubsight/api

Typed, resource-namespaced client for the HubSight gateway REST API. Sibling of
`@hubsight/realtime` (which owns the Socket.IO event bus + WebRTC live view and
the shared domain types this package re-exports).

Consumed by the webapp as TypeScript source — no build step.

## Core

```ts
import { createHubSightClient } from '@hubsight/api';

const api = createHubSightClient({ baseUrl: import.meta.env.VITE_API_URL });

await api.auth.login({ username, password });   // persists the PWA refresh token itself
const cameras = await api.cameras.list();
await api.cameras.restart(id);                  // stop → wait → start
const { data, total } = await api.members.list({ page: 1, search: 'an' });
const url = api.archive.streamUrl(recId, { download: true });
```

The client bundles the axios instance and the 401 → `/auth/refresh` → retry
interceptor that only engages in installed-PWA mode (ported from the old
`webapp/src/api/axiosClient.ts`). Pass `onSessionExpired` to redirect to login
when a refresh finally fails, or pass your own `http` instance to opt out.

### Resources

| namespace | endpoints |
|---|---|
| `auth` | `me`, `login`, `logout`, `verifyPassword`, `changePassword`, `setLocale`, `setTimezone`, `setPreferences` |
| `cameras` | `list`, `create`, `update`, `remove`, `start`, `stop`, `restart`, `recognitionLogs`, `clearRecognitionLogs` |
| `members` | `list`, `create`, `update`, `remove`, `uploadAvatar`, `removeAvatar`, `listFaces`, `enrollFace`, `deleteFace`, `deleteFaces` |
| `notifications` | `list`, `markRead`, `markAllRead`, `remove`, `clear`, `sendTest`, `pushConfig`, `subscribePush` |
| `devices` | `startScan`, `getScan` |
| `archive` | `availableDays`, `timeline`, `streamUrl`, `thumbnailUrl` |
| `pool` | `status` |
| `recorder` | `status`, `updateSettings`, `storageCleanup` |

`api.http` is the raw axios instance for anything not yet wrapped.

## React

```tsx
import { HubSightProvider, useHubSight } from '@hubsight/api/react';

<HubSightProvider baseUrl={import.meta.env.VITE_API_URL}>…</HubSightProvider>

const api = useHubSight();
```

## Errors

`apiErrorMessage(err, fallback)` pulls the `{ error }` string out of an axios
failure; `toApiError(err)` wraps it as a `HubSightApiError` with `.status`.
