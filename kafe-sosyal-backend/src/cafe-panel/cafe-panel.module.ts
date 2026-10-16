import { Module } from '@nestjs/common';
import { CafeAuthGuard } from './cafe-auth.guard';
import { CafeAuthService } from './cafe-auth.service';
import { CafeEventsService } from './cafe-events.service';
import { CafeRegisterService } from './cafe-register.service';
import { CafeStatsService } from './cafe-stats.service';
import { CafePanelController } from './cafe-panel.controller';
import { CafePanelService } from './cafe-panel.service';

@Module({ controllers: [CafePanelController], providers: [CafeAuthService, CafeAuthGuard, CafePanelService, CafeEventsService, CafeStatsService, CafeRegisterService] })
export class CafePanelModule {}
