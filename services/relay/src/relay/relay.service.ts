import { Injectable, Logger } from '@nestjs/common';
import { RelayGateway, EmitEventDto, BroadcastEventDto } from './relay.gateway';

@Injectable()
export class RelayService {
  private readonly logger = new Logger(RelayService.name);

  constructor(private readonly relayGateway: RelayGateway) {}

  emitEvent(dto: EmitEventDto) {
    const payload = {
      ...dto.data,
      _timestamp: new Date().toISOString(),
    };

    if (dto.room) {
      this.relayGateway.server.to(dto.room).emit(dto.event, payload);
      this.logger.log(`Emitted event "${dto.event}" to room "${dto.room}"`);
      return { status: 'emitted', target: `room:${dto.room}`, event: dto.event };
    }

    if (dto.socketId) {
      this.relayGateway.server.to(dto.socketId).emit(dto.event, payload);
      this.logger.log(`Emitted event "${dto.event}" to socket "${dto.socketId}"`);
      return { status: 'emitted', target: `socket:${dto.socketId}`, event: dto.event };
    }

    this.relayGateway.server.emit(dto.event, payload);
    this.logger.log(`Emitted event "${dto.event}" to all connected clients`);
    return { status: 'emitted', target: 'all', event: dto.event };
  }

  broadcastEvent(dto: BroadcastEventDto) {
    const payload = {
      ...dto.data,
      _timestamp: new Date().toISOString(),
    };
    this.relayGateway.server.emit(dto.event, payload);
    this.logger.log(`Broadcasted event "${dto.event}" to all clients`);
    return { status: 'broadcasted', event: dto.event };
  }

  handleUserBlocked(userId: string) {
    const room = `user_${userId}`;
    const payload = {
      userId,
      reason: 'account_blocked',
      message: 'Tài khoản của bạn đã bị khóa bởi quản trị viên.',
      _timestamp: new Date().toISOString(),
    };

    // 1. Emit force logout event to user's personal room
    this.relayGateway.server.to(room).emit('auth:force_logout', payload);
    this.logger.log(`Emitted "auth:force_logout" to room "${room}" for blocked user ${userId}`);

    // 2. Forcefully disconnect all active sockets belonging to this user
    setTimeout(() => {
      this.relayGateway.server.in(room).disconnectSockets(true);
      this.logger.log(`Disconnected all sockets in room "${room}" for user ${userId}`);
    }, 500);

    return { status: 'kicked', userId };
  }

  getStats() {
    const socketCount = this.relayGateway.server?.sockets?.sockets?.size || 0;
    const adapter = this.relayGateway.server?.sockets?.adapter;
    const roomsCount = adapter?.rooms?.size || 0;

    return {
      status: 'ok',
      service: 'socket-relay-service',
      activeConnections: socketCount,
      activeRooms: roomsCount,
      timestamp: new Date().toISOString(),
    };
  }
}
