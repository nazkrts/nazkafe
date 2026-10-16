import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { AuthUser, JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { EventsService } from './events.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Post('events/:id/join')
  @HttpCode(200)
  join(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.join(user.id, id);
  }

  @Delete('events/:id/join')
  @HttpCode(200)
  leave(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.leave(user.id, id);
  }

  @Get('me/events')
  mine(@CurrentUser() user: AuthUser) {
    return this.events.mine(user.id);
  }
}
