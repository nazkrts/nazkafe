import { Module } from '@nestjs/common';
import { CheckinsModule } from '../checkins/checkins.module';
import { DiscoverController } from './discover.controller';
import { DiscoverService } from './discover.service';

@Module({
  imports: [CheckinsModule],
  controllers: [DiscoverController],
  providers: [DiscoverService],
})
export class DiscoverModule {}
