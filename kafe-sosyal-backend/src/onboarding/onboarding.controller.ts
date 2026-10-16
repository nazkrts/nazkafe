import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { LEGAL_DOCUMENTS } from './legal';
import { CompleteOnboardingDto } from './onboarding.dto';
import { OnboardingService } from './onboarding.service';

@Controller()
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  /** Giriş yapmadan erişilir: kayıt ekranı güncel metin sürümlerini buradan alır. */
  @Get('legal/documents')
  documents() {
    return { documents: LEGAL_DOCUMENTS };
  }

  @Post('onboarding/complete')
  @HttpCode(201)
  complete(@Body() dto: CompleteOnboardingDto) {
    return this.onboarding.complete(dto);
  }
}
