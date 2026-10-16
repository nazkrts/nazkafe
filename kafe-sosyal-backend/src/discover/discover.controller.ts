import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { AuthUser, JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { DiscoverService } from './discover.service';

@Controller('discover')
@UseGuards(JwtAuthGuard)
export class DiscoverController {
  constructor(private readonly discover: DiscoverService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.discover.list(user.id);
  }

  @Post(':userId/like')
  @HttpCode(200)
  like(@CurrentUser() user: AuthUser, @Param('userId', ParseUUIDPipe) targetId: string) {
    return this.discover.like(user.id, targetId);
  }

  @Post(':userId/pass')
  @HttpCode(200)
  pass(@CurrentUser() user: AuthUser, @Param('userId', ParseUUIDPipe) targetId: string) {
    return this.discover.pass(user.id, targetId);
  }
}
