import {
  Controller,
  Get,
} from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { RelayService } from './relay.service';
import { EmitEventDto, BroadcastEventDto } from './dto/relay.dto';

@Controller('relay')
export class RelayController {
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
}
