import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class SendMessageDto {
  @IsString()
  @MaxLength(4000)
  body: string;
}

export class ListMessagesQuery {
  /** Bu mesajdan önceki mesajları getirir (sayfalama) */
  @IsOptional()
  @IsUUID()
  before?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
