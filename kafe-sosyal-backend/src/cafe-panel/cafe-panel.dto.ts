import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsInt, IsNumber, IsObject, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CafeLoginDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password: string;
}

/** Değerlerin içeriği servis tarafında (cafe-rules) doğrulanır. */
export class UpdateCafeProfileDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(200) branch_name?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) description?: string | null;
  @IsOptional() @IsString() @MaxLength(400) address?: string;
  @IsOptional() @IsString() @MaxLength(200) city?: string;
  @IsOptional() @IsString() @MaxLength(200) district?: string | null;
  @IsOptional() @IsNumber() lat?: number | null;
  @IsOptional() @IsNumber() lng?: number | null;
  @IsOptional() @IsObject() opening_hours?: Record<string, unknown>;
}

export class CreateMeetingPointDto {
  @IsString()
  @MaxLength(200)
  label: string;
}

export class UpdateMeetingPointDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

/** Alan içerikleri servis tarafında (event-rules) doğrulanır. */
export class CreateEventDto {
  @IsString() @MaxLength(200) title: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string | null;
  @IsOptional() @IsString() @MaxLength(40) category?: string | null;
  @IsString() @MaxLength(40) starts_at: string;
  @IsString() @MaxLength(40) ends_at: string;
  @IsOptional() @IsInt() capacity?: number | null;
}

export class UpdateEventDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string | null;
  @IsOptional() @IsString() @MaxLength(40) category?: string | null;
  @IsOptional() @IsString() @MaxLength(40) starts_at?: string;
  @IsOptional() @IsString() @MaxLength(40) ends_at?: string;
  @IsOptional() @IsInt() capacity?: number | null;
}

export class StatsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days?: number;
}

export class CafeRegisterDto {
  @IsString() @MaxLength(200) name: string;
  @IsOptional() @IsString() @MaxLength(200) branch_name?: string | null;
  @IsString() @MaxLength(400) address: string;
  @IsString() @MaxLength(200) city: string;
  @IsOptional() @IsString() @MaxLength(200) district?: string | null;
  @IsEmail() @MaxLength(254) email: string;
  @IsString() @MaxLength(200) password: string;
}
