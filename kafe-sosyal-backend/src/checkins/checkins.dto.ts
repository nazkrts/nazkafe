import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsString, IsUUID, Length, MaxLength } from 'class-validator';

export class ScanDto {
  @IsUUID()
  cafe_id: string;

  @IsString()
  @Length(10, 64)
  qr_token: string;
}

export class SetIntentsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(30, { each: true })
  intents: string[];
}

export class SetVisibilityDto {
  @IsBoolean()
  visible: boolean;
}
