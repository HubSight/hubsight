import { Injectable, Logger } from '@nestjs/common';
import { RelayGateway } from './relay.gateway';
import { EmitEventDto, BroadcastEventDto } from './dto/relay.dto';

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
