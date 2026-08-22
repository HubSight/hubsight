import {
  Controller,
  Get,
} from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { RelayService } from './relay.service';
import { EmitEventDto, BroadcastEventDto } from './dto/relay.dto';

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
}
