import {
  Controller,
  Get,
} from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { RelayService } from './relay.service';
import { EmitEventDto, BroadcastEventDto } from './relay.gateway';

@Controller()
export class RelayConsumer {
  constructor(private readonly relayService: RelayService) {}

  @Get('health')
  getHealth() {
    return this.relayService.getStats();
  }

  @EventPattern('relay.emit')
  handleEmitEvent(@Payload() dto: EmitEventDto) {
    return this.relayService.emitEvent(dto);
  }

  @EventPattern('relay.broadcast')
  handleBroadcastEvent(@Payload() dto: BroadcastEventDto) {
    return this.relayService.broadcastEvent(dto);
  }

  @EventPattern('vision.person.entered')
  handlePersonEntered(@Payload() data: any) {
    return this.relayService.broadcastEvent({
      event: 'vision.person.entered',
      data,
    });
  }

  @EventPattern('vision.person.update')
  handlePersonUpdate(@Payload() data: any) {
    return this.relayService.broadcastEvent({
      event: 'vision.person.update',
      data,
    });
  }

  @EventPattern('vision.person.left')
  handlePersonLeft(@Payload() data: any) {
    return this.relayService.broadcastEvent({
      event: 'vision.person.left',
      data,
    });
  }

  @EventPattern('member.face.updated')
  handleMemberFaceUpdated(@Payload() data: any) {
    return this.relayService.broadcastEvent({
      event: 'member.face.updated',
      data,
    });
  }

  @EventPattern('notification.new')
  handleNotificationNew(@Payload() data: any) {
    return this.relayService.broadcastEvent({
      event: 'notification.new',
      data,
    });
  }

  @EventPattern('vision.log.new')
  handleVisionLogNew(@Payload() data: any) {
    return this.relayService.broadcastEvent({
      event: 'vision.log.new',
      data,
    });
  }

  @EventPattern('nvr.status.update')
  handleNvrStatusUpdate(@Payload() data: any) {
    return this.relayService.broadcastEvent({
      event: 'nvr.status.update',
      data,
    });
  }

  @EventPattern('pool.status.update')
  handlePoolStatusUpdate(@Payload() data: any) {
    return this.relayService.broadcastEvent({
      event: 'pool.status.update',
      data,
    });
  }
}
