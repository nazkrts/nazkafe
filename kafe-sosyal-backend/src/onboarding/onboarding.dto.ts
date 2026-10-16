import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CONSENT_TYPES } from './legal';

export class ConsentInputDto {
  @IsString()
  @IsIn(CONSENT_TYPES)
  type: string;

  @IsString()
  @MaxLength(20)
  version: string;

  @IsBoolean()
  granted: boolean;
}

export class CompleteOnboardingDto {
  @IsString()
  @MaxLength(2000)
  onboarding_token: string;

  @IsString()
  @MaxLength(60)
  display_name: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'birth_date YYYY-AA-GG biçiminde olmalı' })
  birth_date: string;

  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ConsentInputDto)
  consents: ConsentInputDto[];
}
