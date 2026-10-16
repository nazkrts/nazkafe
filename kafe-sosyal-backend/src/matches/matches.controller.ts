import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { AuthUser, JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ListMessagesQuery, SendMessageDto } from './matches.dto';
import { MatchesService } from './matches.service';

@Controller('matches')
@UseGuards(JwtAuthGuard)
export class MatchesController {
  constructor(private readonly matches: MatchesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.matches.list(user.id);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.matches.detail(user.id, id);
  }

  @Post(':id/end')
  @HttpCode(200)
  end(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.matches.end(user.id, id);
  }

  @Get(':id/starters')
  starters(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.matches.starters(user.id, id);
  }

  @Get(':id/messages')
  messages(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: ListMessagesQuery) {
    return this.matches.messages(user.id, id, q.before, q.limit);
  }

  @Post(':id/messages')
  @HttpCode(201)
  send(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SendMessageDto) {
    return this.matches.send(user.id, id, dto.body);
  }

  @Post(':id/messages/read')
  @HttpCode(200)
  markRead(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.matches.markRead(user.id, id);
  }
}
