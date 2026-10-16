import { Module } from '@nestjs/common';
import { CheckinsModule } from '../checkins/checkins.module';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';

@Module({ imports: [CheckinsModule], controllers: [InvitationsController], providers: [InvitationsService] })
export class InvitationsModule {}
