import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { AuthUser, JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ConsentChangeDto, SetInterestsDto, UpdateProfileDto } from './me.dto';
import { MeService } from './me.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get('me')
  getMe(@CurrentUser() user: AuthUser) {
    return this.me.getMe(user.id);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.me.updateMe(user.id, dto);
  }

  @Delete('me')
  @HttpCode(204)
  async deleteMe(@CurrentUser() user: AuthUser): Promise<void> {
    await this.me.deleteMe(user.id);
  }

  @Get('interests')
  listInterests() {
    return this.me.listInterests();
  }

  @Put('me/interests')
  setInterests(@CurrentUser() user: AuthUser, @Body() dto: SetInterestsDto) {
    return this.me.setInterests(user.id, dto.interest_ids);
  }

  @Get('consents')
  listConsents(@CurrentUser() user: AuthUser) {
    return this.me.listConsents(user.id);
  }

  @Post('consents')
  @HttpCode(200)
  changeConsent(@CurrentUser() user: AuthUser, @Body() dto: ConsentChangeDto) {
    return this.me.changeConsent(user.id, dto);
  }
}
