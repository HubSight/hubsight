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
  private readonly m2mSecret =
    process.env.M2M_SECRET || 'cctv-internal-m2m-secret';

  private authClient: any;

  afterInit(server: Server) {
    this.logger.log('Socket.IO Relay Gateway initialized with Auth & M2M protection.');
    this.initGrpcClient();
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
      client.join('internal_services');
      this.logger.log(`[M2M Service Connected] Service: ${serviceName} (Socket: ${client.id})`);
      return;
    }

    // 2. Frontend Client Connection -> Validate via Auth Service
    const token = this.extractToken(client);

    if (!token) {
      this.logger.warn(`[Connection Rejected] Client ${client.id} missing auth credentials.`);
      client.emit('auth_error', { message: 'Authentication required. Please provide a valid session token.' });
      client.disconnect(true);
      return;
    }

    try {
      const authResult = await this.validateWithAuthService(token);

      if (!authResult || !authResult.valid || !authResult.user) {
        this.logger.warn(`[Connection Rejected] Invalid token for client ${client.id}`);
        client.emit('auth_error', { message: 'Unauthorized: Session invalid or expired.' });
        client.disconnect(true);
        return;
      }

      // Store authenticated user metadata on socket instance
      client.data = {
        isM2M: false,
        user: authResult.user,
        userId: authResult.user.id,
        username: authResult.user.username,
        role: authResult.role || authResult.user.role,
      };

      // Auto-join personal room & role room
      client.join(`user_${authResult.user.id}`);
      client.join(`role_${authResult.role || authResult.user.role}`);

      this.logger.log(
        `[Client Authenticated] User: ${authResult.user.username} (Role: ${client.data.role}, Socket: ${client.id})`,
      );
    } catch (error) {
      const errObj = error as Error;
      this.logger.error(`[Auth Service Error] Failed to validate token for client ${client.id}: ${errObj.message}`);
      client.emit('auth_error', { message: 'Authentication service temporarily unavailable.' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const ident = client.data?.isM2M
      ? `M2M Service [${client.data.serviceName}]`
      : client.data?.username
      ? `User [${client.data.username}]`
      : 'Unauthenticated client';
    this.logger.log(`Client disconnected: ${client.id} (${ident})`);
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
