import { Body, Controller, Get, HttpCode, Post, Put, UseGuards } from '@nestjs/common';
import { AuthUser, JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ScanDto, SetIntentsDto, SetVisibilityDto } from './checkins.dto';
import { CheckinsService } from './checkins.service';

@Controller('checkins')
@UseGuards(JwtAuthGuard)
export class CheckinsController {
  constructor(private readonly checkins: CheckinsService) {}

  @Post('scan')
  @HttpCode(201)
  scan(@CurrentUser() user: AuthUser, @Body() dto: ScanDto) {
    return this.checkins.scan(user.id, dto.cafe_id, dto.qr_token);
  }

  @Get('current')
  current(@CurrentUser() user: AuthUser) {
    return this.checkins.current(user.id);
  }

  @Put('current/intents')
  setIntents(@CurrentUser() user: AuthUser, @Body() dto: SetIntentsDto) {
    return this.checkins.setIntents(user.id, dto.intents);
  }

  @Put('current/visibility')
  setVisibility(@CurrentUser() user: AuthUser, @Body() dto: SetVisibilityDto) {
    return this.checkins.setVisibility(user.id, dto.visible);
  }

  @Post('current/end')
  @HttpCode(200)
  end(@CurrentUser() user: AuthUser) {
    return this.checkins.end(user.id);
  }
}
