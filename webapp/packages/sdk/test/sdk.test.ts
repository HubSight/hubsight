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

test('RealtimeManager typed events and status', () => {
  let currentState: SocketState = 'connected';
  const stateListeners = new Set<(state: SocketState) => void>();
  const eventHandlers = new Map<string, Array<(data: unknown) => void>>();

  const mockSocket: InternalSocketClient = {
    connect: () => {},
    disconnect: () => {},
    close: () => {},
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
    emit: () => {},
  };

  const realtime = createRealtimeManager({ socket: mockSocket });
  assert.equal(realtime.isConnected(), true);
  assert.equal(realtime.status, 'connected');

  // Test notification listener
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

  const handlers = eventHandlers.get('notification.new') || [];
  for (const h of handlers) h(sampleNotif);

  assert.equal(receivedNotifications.length, 1);
  assert.equal((receivedNotifications[0] as typeof sampleNotif).id, 'notif_1');

  unsubNotif();
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
