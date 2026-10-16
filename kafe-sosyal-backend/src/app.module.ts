import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { BlocksModule } from './blocks/blocks.module';
import { CafePanelModule } from './cafe-panel/cafe-panel.module';
import { CafesModule } from './cafes/cafes.module';
import { CheckinsModule } from './checkins/checkins.module';
import { AppConfigModule } from './config/app-config';
import { DbModule } from './db/db.module';
import { DiscoverModule } from './discover/discover.module';
import { InvitationsModule } from './invitations/invitations.module';
import { EventsModule } from './events/events.module';
import { KvModule } from './kv/kv.module';
import { MatchesModule } from './matches/matches.module';
import { MeModule } from './me/me.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { PhotosModule } from './photos/photos.module';
import { ReportsModule } from './reports/reports.module';
import { SafetyModule } from './safety/safety.module';

@Module({
  imports: [
    AppConfigModule,
    DbModule,
    KvModule,
    AuthModule,
    OnboardingModule,
    MeModule,
    CafesModule,
    CheckinsModule,
    DiscoverModule,
    BlocksModule,
    MatchesModule,
    InvitationsModule,
    SafetyModule,
    ReportsModule,
    AdminModule,
    PhotosModule,
    CafePanelModule,
    EventsModule,
  ],
})
export class AppModule {}
