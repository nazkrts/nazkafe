import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { AuthUser, JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateInvitationDto, RespondInvitationDto } from './invitations.dto';
import { InvitationsService } from './invitations.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Get('invitations/meeting-points')
  meetingPoints(@CurrentUser() user: AuthUser) {
    return this.invitations.meetingPoints(user.id);
  }

  @Get('invitations')
  list(@CurrentUser() user: AuthUser) {
    return this.invitations.list(user.id);
  }

  @Post('matches/:id/invitations')
  @HttpCode(201)
  create(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateInvitationDto) {
    return this.invitations.create(user.id, id, dto.meeting_point_id);
  }

  @Post('invitations/:id/respond')
  @HttpCode(200)
  respond(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RespondInvitationDto) {
    return this.invitations.respond(user.id, id, dto.response);
  }

  @Post('invitations/:id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.invitations.cancel(user.id, id);
  }
}
