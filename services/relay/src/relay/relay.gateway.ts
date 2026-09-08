import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
export class JoinRoomDto {
  room: string;
}

export class LeaveRoomDto {
  room: string;
}

export class RelayMessageDto {
  targetRoom?: string;
  targetSocketId?: string;
  event: string;
  payload: any;
}

export class EmitEventDto {
  room?: string;
  socketId?: string;
  event: string;
  data: any;
}

export class BroadcastEventDto {
  event: string;
  data: any;
}

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';

interface ValidateTokenResponse {
  valid: boolean;
  user?: {
    id: string;
    username: string;
    full_name?: string;
    role: string;
    is_active: boolean;
  };
  role?: string;
  username?: string;
  full_name?: string;
}

@WebSocketGateway({
  path: '/relay',
  cors: {
    origin: (origin, callback) => {
      // In production, restrict this to FRONTEND_URL or specific domains.
      // For now, we allow the request but require valid credentials (token).
      callback(null, true);
    },
    credentials: true,
  },
})
export class RelayGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RelayGateway.name);
  
  // Use gRPC instead of HTTP
  private readonly authGrpcUrl =
    process.env.AUTH_GRPC_URL || 'auth-service:50051';
  private readonly authHttpUrl =
    process.env.AUTH_SERVICE_URL || 'http://auth-service:8081';
  private readonly m2mSecret =
    process.env.M2M_SECRET || 'cctv-internal-m2m-secret';

  private authClient: any;

  afterInit(server: Server) {
    this.logger.log('Socket.IO Relay Gateway initialized with Auth & M2M protection.');
    this.initGrpcClient();

    // Handshake Authentication Middleware: Enforces Client API Key & User Auth Token
    server.use(async (client: Socket, next: (err?: Error) => void) => {
      // 1. Check for Machine-to-Machine (M2M) Internal Service credentials
      const serviceKey =
        client.handshake.auth?.serviceKey ||
        client.handshake.headers['x-service-key'] ||
        client.handshake.headers['x-internal-key'];

      const serviceName =
        client.handshake.auth?.serviceName ||
        client.handshake.headers['x-service-name'] ||
        'internal-service';

      if (serviceKey && serviceKey === this.m2mSecret) {
        client.data = {
          isM2M: true,
          serviceName: String(serviceName),
        };
        return next();
      }

      // 2. Client Application API Key (Client ID) Validation
      const apiKey = this.extractApiKey(client);
      if (!apiKey) {
        this.logger.warn(`[Handshake Rejected] Client ${client.id} missing API key / Client ID.`);
        return next(new Error('CLIENT_KEY_REQUIRED: Client API Key (Client ID) is required to connect.'));
      }

      let clientValidation: { valid: boolean; client?: any };
      try {
        clientValidation = await this.validateClientWithAuthService(apiKey);
      } catch (err) {
        this.logger.error(`[Auth Service Error] Failed to validate client API key for ${client.id}: ${(err as Error).message}`);
        return next(new Error('AUTH_SERVICE_UNAVAILABLE: Authentication service temporarily unavailable.'));
      }

      if (!clientValidation || !clientValidation.valid) {
        this.logger.warn(`[Handshake Rejected] Client ${client.id} provided invalid or deactivated API key.`);
        return next(new Error('INVALID_CLIENT_KEY: Invalid or deactivated Client API Key.'));
      }

      // 3. User Authentication Token Validation
      const token = this.extractToken(client);

      if (!token) {
        this.logger.warn(`[Handshake Rejected] Client ${client.id} missing auth credentials.`);
        return next(new Error('AUTH_REQUIRED: Authentication required. Please provide a valid session token.'));
      }

      try {
        const authResult = await this.validateWithAuthService(token);

        if (!authResult || !authResult.valid || !authResult.user) {
          this.logger.warn(`[Handshake Rejected] Invalid token for client ${client.id}`);
          return next(new Error('INVALID_TOKEN: Unauthorized: Session invalid or expired.'));
        }

        // Store authenticated client & user metadata on socket instance
        client.data = {
          isM2M: false,
          client: clientValidation.client,
          clientId: clientValidation.client?.client_id || clientValidation.client?.clientId || apiKey,
          user: authResult.user,
          userId: authResult.user.id,
          username: authResult.user.username,
          role: authResult.role || authResult.user.role,
        };

        return next();
      } catch (error) {
        const errObj = error as Error;
        this.logger.error(`[Auth Service Error] Failed to validate token for client ${client.id}: ${errObj.message}`);
        return next(new Error('AUTH_SERVICE_UNAVAILABLE: Authentication service temporarily unavailable.'));
      }
    });
  }

  private initGrpcClient() {
    try {
      const PROTO_PATH = path.join(
        __dirname,
        '..',
        '..',
        'proto',
        'auth.proto',
      );
      const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      });
      const protoDesc = grpc.loadPackageDefinition(packageDefinition) as any;
      const AuthService = protoDesc.pb.AuthService;

      this.authClient = new AuthService(
        this.authGrpcUrl,
        grpc.credentials.createInsecure(),
      );
      this.logger.log(`Initialized gRPC client for AuthService at ${this.authGrpcUrl}`);
    } catch (error) {
      this.logger.error('Failed to initialize gRPC client for AuthService', error);
    }
  }

  async handleConnection(client: Socket) {
    if (client.data?.isM2M) {
      client.join('internal_services');
      this.logger.log(`[M2M Service Connected] Service: ${client.data.serviceName} (Socket: ${client.id})`);
      return;
    }

    // Auto-join personal room & role room for authenticated user
    if (client.data?.userId) {
      client.join(`user_${client.data.userId}`);
      client.join(`role_${client.data.role}`);

      this.logger.log(
        `[Client Authenticated] App: ${client.data.clientId} | User: ${client.data.username} (Role: ${client.data.role}, Socket: ${client.id})`,
      );
    }
  }

  handleDisconnect(client: Socket) {
    const ident = client.data?.isM2M
      ? `M2M Service [${client.data.serviceName}]`
      : client.data?.username
      ? `User [${client.data.username}] on [${client.data?.clientId || 'unknown'}]`
      : 'Unauthenticated client';
    this.logger.log(`Client disconnected: ${client.id} (${ident})`);
  }

  private extractApiKey(client: Socket): string | null {
    // 1. Check handshake auth object
    if (client.handshake.auth?.apiKey) return String(client.handshake.auth.apiKey);
    if (client.handshake.auth?.clientId) return String(client.handshake.auth.clientId);
    if (client.handshake.auth?.api_key) return String(client.handshake.auth.api_key);
    if (client.handshake.auth?.client_id) return String(client.handshake.auth.client_id);

    // 2. Check headers
    const headerKey =
      client.handshake.headers['x-api-key'] ||
      client.handshake.headers['x-client-id'];
    if (headerKey) return String(headerKey);

    // 3. Check query parameters
    if (client.handshake.query?.apiKey) return String(client.handshake.query.apiKey);
    if (client.handshake.query?.api_key) return String(client.handshake.query.api_key);
    if (client.handshake.query?.clientId) return String(client.handshake.query.clientId);
    if (client.handshake.query?.client_id) return String(client.handshake.query.client_id);

    return null;
  }

  private extractToken(client: Socket): string | null {
    // 1. Check handshake auth object
    if (client.handshake.auth?.token) {
      return String(client.handshake.auth.token).replace(/^Bearer\s+/i, '');
    }

    // 2. Check Authorization Header
    const authHeader = client.handshake.headers['authorization'];
    if (authHeader) {
      return String(authHeader).replace(/^Bearer\s+/i, '');
    }

    // 3. Check Cookie
    const cookieHeader = client.handshake.headers['cookie'];
    if (cookieHeader) {
      const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
      if (match && match[1]) {
        return decodeURIComponent(match[1]);
      }
    }

    // 4. Check Query Parameter
    if (client.handshake.query?.token) {
      return String(client.handshake.query.token);
    }

    return null;
  }

  private async validateClientWithAuthService(apiKey: string): Promise<{ valid: boolean; client?: any }> {
    // 1. Try gRPC first if VerifyClient is implemented
    if (this.authClient && typeof this.authClient.VerifyClient === 'function') {
      try {
        const res: any = await new Promise((resolve, reject) => {
          this.authClient.VerifyClient({ api_key: apiKey }, (error: any, response: any) => {
            if (error) return reject(error);
            resolve(response);
          });
        });
        if (res) return { valid: !!res.valid, client: res.client };
      } catch (err) {
        this.logger.debug(`gRPC VerifyClient failed, using HTTP fallback: ${(err as Error).message}`);
      }
    }

    // 2. HTTP Fallback to auth-service /auth/clients/verify
    try {
      const res = await fetch(`${this.authHttpUrl}/auth/clients/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({ api_key: apiKey }),
      });
      if (!res.ok) {
        return { valid: false };
      }
      const data: any = await res.json();
      return { valid: !!data.valid, client: data };
    } catch (err) {
      this.logger.error(`Failed to verify client via HTTP: ${(err as Error).message}`);
      return { valid: false };
    }
  }

  private async validateWithAuthService(token: string): Promise<ValidateTokenResponse> {
    if (!this.authClient) {
      throw new Error('Auth gRPC client not initialized');
    }
    return new Promise((resolve, reject) => {
      this.authClient.VerifyToken({ token }, (error: any, response: any) => {
        if (error) {
          return reject(error);
        }
        resolve(response as ValidateTokenResponse);
      });
    });
  }

  @SubscribeMessage('join_room')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: JoinRoomDto,
  ) {
    if (data && data.room) {
      client.join(data.room);
      this.logger.log(`Socket ${client.id} (${client.data?.username || 'M2M'}) joined room: ${data.room}`);
      return { status: 'ok', room: data.room };
    }
    return { status: 'error', message: 'Room name required' };
  }

  @SubscribeMessage('leave_room')
  handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: LeaveRoomDto,
  ) {
    if (data && data.room) {
      client.leave(data.room);
      this.logger.log(`Socket ${client.id} (${client.data?.username || 'M2M'}) left room: ${data.room}`);
      return { status: 'ok', room: data.room };
    }
    return { status: 'error', message: 'Room name required' };
  }

  @SubscribeMessage('relay_message')
  handleRelayMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: RelayMessageDto,
  ) {
    if (!data || !data.event) {
      return { status: 'error', message: 'Event name required' };
    }

    // Security check: Only M2M services (or admins) can broadcast system/vision events
    const isSystemEvent = data.event.startsWith('vision.') || data.event.startsWith('system.');
    if (isSystemEvent && !client.data?.isM2M && client.data?.role !== 'admin') {
      this.logger.warn(`Unauthorized attempt to broadcast system event "${data.event}" by socket ${client.id}`);
      return { status: 'error', message: 'Unauthorized to broadcast system events' };
    }

    const payload = {
      ...data.payload,
      _from: client.id,
      _sender: client.data?.username || client.data?.serviceName || 'anonymous',
      _timestamp: new Date().toISOString(),
    };

    if (data.targetRoom) {
      client.to(data.targetRoom).emit(data.event, payload);
      this.logger.debug(`Relayed event "${data.event}" to room: ${data.targetRoom}`);
    } else if (data.targetSocketId) {
      this.server.to(data.targetSocketId).emit(data.event, payload);
      this.logger.debug(`Relayed event "${data.event}" to socket: ${data.targetSocketId}`);
    } else {
      client.broadcast.emit(data.event, payload);
      this.logger.debug(`Broadcasted relayed event "${data.event}"`);
    }

    return { status: 'relayed', event: data.event };
  }
}
