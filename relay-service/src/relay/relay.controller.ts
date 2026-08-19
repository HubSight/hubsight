import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { RelayService } from './relay.service';
import { EmitEventDto, BroadcastEventDto } from './dto/relay.dto';

@Controller('relay')
export class RelayController {
  private readonly m2mSecret =
    process.env.M2M_SECRET || 'cctv-internal-m2m-secret';

  constructor(private readonly relayService: RelayService) {}

  @Get('health')
  getHealth() {
    return this.relayService.getStats();
  }

  @Post('emit')
  emitEvent(
    @Body() dto: EmitEventDto,
    @Headers('x-service-key') serviceKey?: string,
  ) {
    if (serviceKey && serviceKey !== this.m2mSecret) {
      throw new UnauthorizedException('Invalid M2M service key');
    }
    return this.relayService.emitEvent(dto);
  }

  @Post('broadcast')
  broadcastEvent(
    @Body() dto: BroadcastEventDto,
    @Headers('x-service-key') serviceKey?: string,
  ) {
    if (serviceKey && serviceKey !== this.m2mSecret) {
      throw new UnauthorizedException('Invalid M2M service key');
    }
    return this.relayService.broadcastEvent(dto);
  }
}
