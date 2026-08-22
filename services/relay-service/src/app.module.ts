import { Module } from '@nestjs/common';
import { RelayModule } from './relay/relay.module';

@Module({
  imports: [RelayModule],
})
export class AppModule {}
