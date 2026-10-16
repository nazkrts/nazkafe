import { Module } from '@nestjs/common';
import { CheckinsController } from './checkins.controller';
import { CheckinsMaintenanceService } from './checkins-maintenance.service';
import { CheckinsService } from './checkins.service';

@Module({
  controllers: [CheckinsController],
  providers: [CheckinsService, CheckinsMaintenanceService],
  exports: [CheckinsService],
})
export class CheckinsModule {}
