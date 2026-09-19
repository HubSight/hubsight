import { randomUUID } from 'node:crypto';
import { IncomingMessage, Server as HttpServer } from 'node:http';
import { Duplex } from 'node:stream';
import { URL } from 'node:url';
import { Injectable, Logger } from '@nestjs/common';
import { WebSocket, WebSocketServer } from 'ws';

type Permission = string;

interface RelayIdentity {
  userId: string;
  username: string;
  role: string;
  permissions: Permission[];
  sessionId: string;
  clientId: string;
}

interface AdminSocket extends WebSocket {
  identity?: RelayIdentity;
  subscriptions?: Set<string>;
}

interface AdminEvent {
  type: 'event';
  event_id: string;
  schema_version: 1;
  topic: string;
  timestamp: string;
  data: unknown;
}

interface TopicRule {
  pattern: string;
  permission: Permission;
}

const TOPIC_RULES: TopicRule[] = [
  { pattern: 'admin_api.enabled', permission: 'system:monitor' },
  { pattern: 'admin_api.disabled', permission: 'system:monitor' },
  { pattern: 'auth.force_logout', permission: 'users:view' },
  { pattern: 'session.revoked', permission: 'users:view' },
  { pattern: 'camera.*', permission: 'cameras:view' },
  { pattern: 'pool.status.update', permission: 'system:monitor' },
  { pattern: 'nvr.status.update', permission: 'system:monitor' },
  { pattern: 'vision.person.entered', permission: 'vision:view' },
  { pattern: 'vision.person.update', permission: 'vision:view' },
  { pattern: 'vision.person.left', permission: 'vision:view' },
  { pattern: 'vision.log.new', permission: 'vision:view' },
  { pattern: 'member.face.updated', permission: 'members:view' },
  { pattern: 'notification.new', permission: 'notifications:view' },
  { pattern: 'operation.progress', permission: 'operations:view' },
  { pattern: 'operation.completed', permission: 'operations:view' },
  { pattern: 'operation.failed', permission: 'operations:view' },
];

function topicMatches(pattern: string, topic: string): boolean {
  return pattern.endsWith('.*')
    ? topic.startsWith(pattern.slice(0, -1))
    : pattern === topic;
}

function headerValue(request: IncomingMessage, name: string): string {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function writeHandshakeError(socket: Duplex, status: number, code: string): void {
  const body = JSON.stringify({ status: 'error', code, error: code });
  const statusText = status === 401
    ? 'Unauthorized'
    : status === 503
      ? 'Service Unavailable'
      : 'Forbidden';
  socket.write(
    `HTTP/1.1 ${status} ${statusText}\r\n` +
      'Content-Type: application/json\r\n' +
      `Content-Length: ${Buffer.byteLength(body)}\r\n` +
      'Connection: close\r\n\r\n' +
      body,
  );
  socket.destroy();
}

@Injectable()
export class AdminRelayHub {
  private readonly logger = new Logger(AdminRelayHub.name);
  private readonly server = new WebSocketServer({ noServer: true });
  private readonly clients = new Set<AdminSocket>();
  private readonly history: AdminEvent[] = [];
  private readonly historyLimit = 512;
  private readonly authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://auth-service:8081';

  attach(httpServer: HttpServer): void {
    httpServer.on('upgrade', (request, socket, head) => {
      const requestURL = new URL(request.url || '/', 'http://relay.local');
      if (requestURL.pathname !== '/relay/admin/v1') {
        return;
      }

      void this.authenticate(request).then((identity) => {
        if (!identity) {
          writeHandshakeError(socket, 401, 'INVALID_ADMIN_RELAY_CREDENTIALS');
          return;
        }
        this.server.handleUpgrade(request, socket, head, (client) => {
          this.handleConnection(client as AdminSocket, identity);
        });
      }).catch((error) => {
        this.logger.warn(`Admin relay authentication failed: ${(error as Error).message}`);
        writeHandshakeError(socket, 503, 'AUTH_SERVICE_UNAVAILABLE');
      });
    });
  }

  broadcast(topic: string, data: unknown): void {
    if (!this.isKnownTopic(topic)) {
      this.logger.warn(`Dropped non-catalog realtime topic: ${topic}`);
      return;
    }
    const event: AdminEvent = {
      type: 'event',
      event_id: `evt_${randomUUID()}`,
      schema_version: 1,
      topic,
      timestamp: new Date().toISOString(),
      data: data ?? {},
    };
    this.history.push(event);
    if (this.history.length > this.historyLimit) {
      this.history.splice(0, this.history.length - this.historyLimit);
    }
    for (const client of this.clients) {
      if (this.canReceive(client, topic)) {
        this.send(client, event);
      }
    }
    if (topic === 'admin_api.disabled') {
      for (const client of this.clients) {
        client.close(4001, 'Admin API disabled');
      }
    }
  }

  private async authenticate(request: IncomingMessage): Promise<RelayIdentity | null> {
    // Credentials in the URL are deliberately rejected; the SDK contract
    // requires both headers and avoids leaking secrets into proxy/access logs.
    const requestURL = new URL(request.url || '/', 'http://relay.local');
    if (requestURL.searchParams.has('token') || requestURL.searchParams.has('api_key') || requestURL.searchParams.has('client_id')) {
      return null;
    }
    const apiKey = headerValue(request, 'x-api-key');
    const authorization = headerValue(request, 'authorization');
    if (!apiKey || !/^Bearer\s+\S+$/i.test(authorization)) {
      return null;
    }

    const response = await fetch(`${this.authServiceUrl}/admin/v1/auth/relay/validate`, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'X-API-Key': apiKey,
        Accept: 'application/json',
      },
    });
    if (!response.ok) {
      if (response.status === 503) {
        throw new Error('Admin API is disabled');
      }
      return null;
    }
    const payload = await response.json() as {
      valid?: boolean;
      user_id?: string;
      username?: string;
      role?: string;
      permissions?: string[];
      session_id?: string;
      client_id?: string;
    };
    if (!payload.valid || !payload.user_id || !payload.session_id || !payload.client_id) {
      return null;
    }
    return {
      userId: payload.user_id,
      username: payload.username || '',
      role: payload.role || '',
      permissions: payload.permissions || [],
      sessionId: payload.session_id,
      clientId: payload.client_id,
    };
  }

  private handleConnection(client: AdminSocket, identity: RelayIdentity): void {
    client.identity = identity;
    client.subscriptions = new Set<string>();
    this.clients.add(client);
    client.on('message', (raw) => this.handleMessage(client, raw.toString()));
    client.on('close', () => this.clients.delete(client));
    client.on('error', () => this.clients.delete(client));
    this.send(client, {
      type: 'ready',
      schema_version: 1,
      supported_commands: ['subscribe', 'unsubscribe', 'resume', 'ping'],
      session_id: identity.sessionId,
    });
  }

  private handleMessage(client: AdminSocket, raw: string): void {
    let message: { type?: string; topics?: string[] | string; topic?: string; last_event_id?: string };
    try {
      message = JSON.parse(raw) as typeof message;
    } catch {
      this.sendError(client, 'INVALID_JSON');
      return;
    }

    switch (message.type) {
      case 'subscribe':
        this.subscribe(client, message.topics || message.topic);
        break;
      case 'unsubscribe':
        this.unsubscribe(client, message.topics || message.topic);
        break;
      case 'resume':
        this.resume(client, message.last_event_id || '');
        break;
      case 'ping':
        this.send(client, { type: 'pong', timestamp: new Date().toISOString() });
        break;
      default:
        this.sendError(client, 'UNSUPPORTED_COMMAND');
    }
  }

  private subscribe(client: AdminSocket, requested: string[] | string): void {
    const topics = Array.isArray(requested) ? requested : [requested];
    const accepted: string[] = [];
    const denied: string[] = [];
    for (const topic of topics.filter((value): value is string => typeof value === 'string')) {
      if (this.canSubscribe(client.identity, topic)) {
        client.subscriptions?.add(topic);
        accepted.push(topic);
      } else {
        denied.push(topic);
      }
    }
    this.send(client, { type: 'subscribed', topics: accepted, denied });
  }

  private unsubscribe(client: AdminSocket, requested: string[] | string): void {
    const topics = Array.isArray(requested) ? requested : [requested];
    for (const topic of topics.filter((value): value is string => typeof value === 'string')) {
      client.subscriptions?.delete(topic);
    }
    this.send(client, { type: 'unsubscribed', topics });
  }

  private resume(client: AdminSocket, lastEventID: string): void {
    const index = this.history.findIndex((event) => event.event_id === lastEventID);
    if (index < 0) {
      this.send(client, { type: 'replay_unavailable', last_event_id: lastEventID });
      return;
    }
    for (const event of this.history.slice(index + 1)) {
      if (this.canReceive(client, event.topic)) {
        this.send(client, event);
      }
    }
    this.send(client, { type: 'resumed', last_event_id: lastEventID });
  }

  private canReceive(client: AdminSocket, topic: string): boolean {
    return Array.from(client.subscriptions || []).some((subscription) => topicMatches(subscription, topic)) &&
      this.canSubscribe(client.identity, topic);
  }

  private canSubscribe(identity: RelayIdentity | undefined, requested: string): boolean {
    if (!identity || !requested || requested.includes('..')) {
      return false;
    }
    const rules = TOPIC_RULES.filter((rule) => topicMatches(rule.pattern, requested) || topicMatches(requested, rule.pattern));
    if (rules.length === 0) {
      return false;
    }
    return identity.role === 'admin' || identity.permissions.includes('*') || rules.some((rule) => identity.permissions.includes(rule.permission));
  }

  private isKnownTopic(topic: string): boolean {
    return TOPIC_RULES.some((rule) => topicMatches(rule.pattern, topic));
  }

  private sendError(client: AdminSocket, code: string): void {
    this.send(client, { type: 'error', code, error: code });
  }

  private send(client: AdminSocket, payload: unknown): void {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(payload));
    }
  }
}
