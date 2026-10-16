import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { AuthUser, JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SafetyAlertDto } from './safety.dto';
import { SafetyService } from './safety.service';

@Controller('safety')
@UseGuards(JwtAuthGuard)
export class SafetyController {
  constructor(private readonly safety: SafetyService) {}

  @Post('alert')
  @HttpCode(200)
  alert(@CurrentUser() user: AuthUser, @Body() dto: SafetyAlertDto) {
    return this.safety.alert(user.id, dto);
  }
}
