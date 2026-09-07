import { Module } from '@nestjs/common';
import { RelayGateway } from './relay.gateway';
import { RelayService } from './relay.service';
import { RelayConsumer } from './relay.consumer';

@Module({
  providers: [RelayGateway, RelayService],
  controllers: [RelayConsumer],
  exports: [RelayService, RelayGateway],
})
export class RelayModule {}
