import { IsString, Length, MaxLength } from 'class-validator';

export class RequestOtpDto {
  @IsString()
  @MaxLength(254)
  identifier: string;
}

export class VerifyOtpDto {
  @IsString()
  @MaxLength(254)
  identifier: string;

  @IsString()
  @Length(6, 6)
  code: string;
}

export class RefreshDto {
  @IsString()
  @MaxLength(200)
  refresh_token: string;
}
