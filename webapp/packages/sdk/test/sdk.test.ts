import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createHubSightClient,
  HubSightError,
  HubSightApiError,
  AuthenticationError,
  ValidationError,
  HubSightNetworkError,
  isHubSightError,
  isApiError,
  getErrorMessage,
  MemorySessionAdapter,
  toApiError,
  apiErrorMessage,
  isPwa,
  getPwaRefreshToken,
  setPwaRefreshToken,
  clearPwaRefreshToken,
} from '../src/index';

import { createAuthManager } from '../src/auth/manager';
import { createRealtimeManager } from '../src/realtime/manager';
import type { InternalHttpClient } from '../src/internal/http/types';
import type { InternalSocketClient, SocketState } from '../src/internal/socket/types';
import type { User } from '../src/types/index';

test('HubSightError hierarchy and type guards', () => {
  const base = new HubSightError('Base error', { code: 'CUSTOM_CODE' });
  assert.equal(base.name, 'HubSightError');
  assert.equal(base.code, 'CUSTOM_CODE');
  assert.equal(isHubSightError(base), true);
  assert.equal(isApiError(base), false);

  const apiErr = new HubSightApiError('Server broke', { status: 500, data: { detail: 'crash' } });
  assert.equal(apiErr.name, 'HubSightApiError');
  assert.equal(apiErr.status, 500);
  assert.equal(apiErr.isServerError, true);
  assert.equal(apiErr.isClientError, false);
  assert.equal(isHubSightError(apiErr), true);
  assert.equal(isApiError(apiErr), true);
  assert.equal(isApiError(apiErr, 500), true);
  assert.equal(isApiError(apiErr, 404), false);

  const authErr = new AuthenticationError('Please log in');
  assert.equal(authErr.status, 401);
  assert.equal(authErr.isAuthError, true);
  assert.equal(isApiError(authErr, 401), true);

  const valErr = new ValidationError('Bad input', { details: { username: 'too short' } });
  assert.equal(valErr.status, 400);
  assert.equal(valErr.details?.username, 'too short');

  const netErr = new HubSightNetworkError('No connection', { isOffline: true });
  assert.equal(netErr.isOffline, true);
  assert.equal(isHubSightError(netErr), true);

  // getErrorMessage extraction
  assert.equal(getErrorMessage(valErr), 'Bad input');
  assert.equal(getErrorMessage({ message: 'Plain object error' }), 'Plain object error');
  assert.equal(getErrorMessage({ error: 'Backend error string' }), 'Backend error string');
  assert.equal(getErrorMessage('Raw string error'), 'Raw string error');
  assert.equal(getErrorMessage(null, 'Fallback'), 'Fallback');
});

test('SessionStorageAdapter operations', () => {
  const mem = new MemorySessionAdapter(true);
  assert.equal(mem.isPwa(), true);
  assert.equal(mem.getToken(), null);

  mem.setToken('test-refresh-token');
  assert.equal(mem.getToken(), 'test-refresh-token');

  mem.clear();
  assert.equal(mem.getToken(), null);
});

test('AuthManager state, permissions, and force logout', () => {
  const mockHttp: InternalHttpClient = {
    get: async () => ({}),
    post: async () => ({}),
    put: async () => ({}),
    patch: async () => ({}),
    delete: async () => ({}),
    requestRaw: async () => ({
      status: 200,
      ok: true,
      headers: {},
      text: async () => '',
      json: async () => ({}),
    }),
  };

  const storage = new MemorySessionAdapter(false);
  const auth = createAuthManager({ http: mockHttp, storage });

  assert.equal(auth.state, 'idle');
  assert.equal(auth.getUser(), null);
  assert.equal(auth.isAuthenticated(), false);
  assert.equal(auth.can('cameras:view'), false);

  // Test permission logic with admin role
  const adminUser: User = {
    id: 'usr_admin',
    username: 'admin',
    role: 'admin',
    is_active: true,
  };
  // @ts-expect-error testing internal state
  auth.currentUser = adminUser;
  assert.equal(auth.can('anything:view'), false); // user not set via official flow yet

  // Test subscription to auth state changes
  const events: string[] = [];
  const unsub = auth.onAuthStateChange((event) => {
    events.push(event);
  });

  // Trigger force logout
  auth.handleForceLogout('account_blocked', 'Tài khoản bị khóa');
  assert.equal(auth.state, 'unauthenticated');
  assert.equal(auth.getUser(), null);
  assert.equal(events.includes('FORCE_LOGGED_OUT'), true);

  unsub();
});

test('RealtimeManager encapsulated on* prefix methods and status', () => {
  let currentState: SocketState = 'connected';
  const stateListeners = new Set<(state: SocketState) => void>();
  const eventHandlers = new Map<string, Array<(data: unknown) => void>>();

  const mockSocket: InternalSocketClient = {
    connect: () => { },
    disconnect: () => { },
    close: () => { },
    isConnected: () => currentState === 'connected',
    getState: () => currentState,
    onStateChange: (listener) => {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
    on: (event, handler) => {
      const list = eventHandlers.get(event) || [];
      list.push(handler);
      eventHandlers.set(event, list);
      return () => {
        const remaining = (eventHandlers.get(event) || []).filter((h) => h !== handler);
        eventHandlers.set(event, remaining);
      };
    },
    emit: () => { },
  };

  const realtime = createRealtimeManager({ socket: mockSocket });
  assert.equal(realtime.isConnected(), true);
  assert.equal(realtime.status, 'connected');

  // 1. onNotification
  const receivedNotifications: unknown[] = [];
  const unsubNotif = realtime.onNotification((n) => {
    receivedNotifications.push(n);
  });
  const sampleNotif = {
    id: 'notif_1',
    title: 'Camera alert',
    body: 'Motion detected',
    category: 'stranger',
    is_read: false,
    created_at: new Date().toISOString(),
  };
  for (const h of eventHandlers.get('notification.new') || []) h(sampleNotif);
  assert.equal(receivedNotifications.length, 1);
  assert.equal((receivedNotifications[0] as typeof sampleNotif).id, 'notif_1');
  unsubNotif();

  // 2. onForceLogout
  let logoutReason = '';
  const unsubLogout = realtime.onForceLogout((ev) => {
    logoutReason = ev.reason || '';
  });
  for (const h of eventHandlers.get('auth:force_logout') || []) h({ userId: 'u1', reason: 'blocked' });
  assert.equal(logoutReason, 'blocked');
  unsubLogout();

  // 3. onVision and onVisionPersonEntered
  let enteredCamera = '';
  let visionCamera = '';
  const unsubVision = realtime.onVision((ev) => {
    visionCamera = ev.camera_id || '';
  });
  const unsubEntered = realtime.onVisionPersonEntered((ev) => {
    enteredCamera = ev.camera_id || '';
  });
  for (const h of eventHandlers.get('vision.person.entered') || []) h({ camera_id: 'cam_yard' });
  assert.equal(enteredCamera, 'cam_yard');
  assert.equal(visionCamera, 'cam_yard');
  unsubVision();
  unsubEntered();

  // 4. onCamera & onCameraStopped
  let stoppedCamId = '';
  let anyCamId = '';
  const unsubCamera = realtime.onCamera((ev) => {
    anyCamId = ev.id || '';
  });
  const unsubStopped = realtime.onCameraStopped((ev) => {
    stoppedCamId = ev.id || '';
  });
  for (const h of eventHandlers.get('camera.stopped') || []) h({ id: 'cam_front', is_stopped: true });
  assert.equal(stoppedCamId, 'cam_front');
  assert.equal(anyCamId, 'cam_front');
  unsubCamera();
  unsubStopped();

  // 5. onPoolStatus
  let totalStreams = 0;
  const unsubPool = realtime.onPoolStatus((status) => {
    totalStreams = status.total_live_streams;
  });
  for (const h of eventHandlers.get('pool.status.update') || []) h({ total_live_streams: 7 });
  assert.equal(totalStreams, 7);
  unsubPool();
});

test('HubSightClient factory initialization and auto-wiring', () => {
  const client = createHubSightClient({
    baseUrl: 'http://localhost:8088/api',
    autoConnectRealtime: false,
    sessionStorage: new MemorySessionAdapter(false),
  });

  assert.equal(client.baseUrl, 'http://localhost:8088/api');
  assert.ok(client.auth);
  assert.ok(client.realtime);
  assert.ok(client.media);
  assert.ok(client.cameras);
  assert.ok(client.devices);
  assert.ok(client.members);
  assert.ok(client.notifications);
  assert.ok(client.archive);
  assert.ok(client.access);
  assert.ok(client.users);
  assert.ok(client.roles);
  assert.ok(client.permissions);
  assert.ok(client.pool);
  assert.ok(client.recorder);

  client.destroy();
});

test('Backward compatibility helpers and PWA storage', () => {
  const err = toApiError(new Error('Test message'));
  assert.ok(isApiError(err));
  assert.equal(err.message, 'Test message');
  assert.equal(apiErrorMessage(err), 'Test message');

  const existingApiErr = new HubSightApiError('Direct API error', { status: 400 });
  assert.equal(toApiError(existingApiErr), existingApiErr);

  // PWA storage functions in non-browser environment
  assert.equal(typeof isPwa(), 'boolean');
  assert.equal(isPwa(), false);

  // When window.localStorage is present (browser environment simulation)
  const store = new Map<string, string>();
  const fakeStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  };
  (globalThis as unknown as { window?: unknown }).window = { localStorage: fakeStorage };

  try {
    setPwaRefreshToken('token_123');
    assert.equal(getPwaRefreshToken(), 'token_123');
    clearPwaRefreshToken();
    assert.equal(getPwaRefreshToken(), null);
  } finally {
    delete (globalThis as unknown as { window?: unknown }).window;
  }
});

test('createBaseClient lightweight initialization and functional standalone API', async () => {
  const { createBaseClient } = await import('../src/client');
  const {
    listCameras,
    startDeviceScan,
    listMembers,
    listNotifications,
    getPoolStatus,
    getNvrStatus,
  } = await import('../src/resources/index');

  const baseClient = createBaseClient({
    baseUrl: 'http://localhost:8088/api',
    sessionStorage: new MemorySessionAdapter(false),
  });

  assert.equal(baseClient.baseUrl, 'http://localhost:8088/api');
  assert.ok(baseClient.auth);
  assert.ok(baseClient.http);

  // Mock http.get and http.post to test standalone functional API execution
  let requestedPath = '';
  baseClient.http.get = async <T>(path: string): Promise<T> => {
    requestedPath = path;
    if (path === '/cameras') return [{ id: 'cam_1', name: 'Front' }] as unknown as T;
    if (path === '/notifications') return { unread_count: 2, notifications: [] } as unknown as T;
    if (path === '/pool/status') return { total_live_streams: 3 } as unknown as T;
    if (path === '/recorder/status') return { active_records: 1 } as unknown as T;
    if (path.startsWith('/members')) return [] as unknown as T;
    return {} as unknown as T;
  };
  baseClient.http.post = async <T>(path: string): Promise<T> => {
    requestedPath = path;
    if (path === '/devices/scan') return { job_id: 'job_scan_1' } as unknown as T;
    return {} as unknown as T;
  };

  // 1. listCameras
  const cams = await listCameras(baseClient);
  assert.equal(requestedPath, '/cameras');
  assert.equal(cams.length, 1);
  assert.equal(cams[0].id, 'cam_1');

  // 2. startDeviceScan
  const scan = await startDeviceScan(baseClient);
  assert.equal(requestedPath, '/devices/scan');
  assert.equal(scan.job_id, 'job_scan_1');

  // 3. listMembers
  const members = await listMembers(baseClient);
  assert.ok(Array.isArray(members.data));

  // 4. listNotifications
  const notifs = await listNotifications(baseClient);
  assert.equal(notifs.unread_count, 2);

  // 5. getPoolStatus
  const pool = await getPoolStatus(baseClient);
  assert.equal(pool.total_live_streams, 3);

  // 6. getNvrStatus
  const nvr = await getNvrStatus(baseClient);
  assert.equal(nvr.active_records, 1);

  baseClient.destroy();
});

test('Tree-shakable subpath entrypoints import cleanly', async () => {
  const authModule = await import('../src/auth/index');
  assert.ok(authModule.createAuthManager);
  assert.ok(authModule.LocalStorageSessionAdapter);
  assert.ok(authModule.isPwa);

  const errorsModule = await import('../src/errors/index');
  assert.ok(errorsModule.HubSightError);
  assert.ok(errorsModule.isApiError);
  assert.ok(errorsModule.toApiError);

  const realtimeModule = await import('../src/realtime/index');
  assert.ok(realtimeModule.createRealtimeManager);
  assert.ok(realtimeModule.createInternalSocketClient);

  const mediaModule = await import('../src/media/index');
  assert.ok(mediaModule.createMediaManager);
  assert.ok(mediaModule.createLiveStreamSession);

  const resourcesModule = await import('../src/resources/index');
  assert.ok(resourcesModule.listCameras);
  assert.ok(resourcesModule.createCamerasResource);
});
