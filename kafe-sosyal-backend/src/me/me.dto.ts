import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { CONSENT_TYPES } from '../onboarding/legal';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  display_name?: string;

  /** null veya boş metin bio'yu temizler */
  @IsOptional()
  @IsString()
  @MaxLength(400)
  bio?: string | null;
}

export class SetInterestsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @ArrayUnique()
  @IsInt({ each: true })
  interest_ids: number[];
}

export class ConsentChangeDto {
  @IsString()
  @IsIn(CONSENT_TYPES)
  type: string;

  @IsString()
  @MaxLength(20)
  version: string;

  @IsBoolean()
  granted: boolean;
}
