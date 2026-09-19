import { Module } from '@nestjs/common';
import { RelayGateway } from './relay.gateway';
import { RelayService } from './relay.service';
import { RelayConsumer } from './relay.consumer';
import { AdminRelayHub } from './admin-relay.hub';

@Module({
  providers: [RelayGateway, RelayService, AdminRelayHub],
  controllers: [RelayConsumer],
  exports: [RelayService, RelayGateway, AdminRelayHub],
})
export class RelayModule {}
