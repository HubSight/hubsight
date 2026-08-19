import { Module } from '@nestjs/common';
import { RelayGateway } from './relay.gateway';
import { RelayService } from './relay.service';
import { RelayController } from './relay.controller';

@Module({
  providers: [RelayGateway, RelayService],
  controllers: [RelayController],
  exports: [RelayService, RelayGateway],
})
export class RelayModule {}
