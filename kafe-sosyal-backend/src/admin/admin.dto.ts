import { Type } from 'class-transformer';
import { IsEmail, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class AdminLoginDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password: string;
}

export class ReportQueueQuery {
  /** open = açık ve incelemede, closed = sonuçlanmış, all = hepsi */
  @IsOptional()
  @IsIn(['open', 'closed', 'all'])
  status?: 'open' | 'closed' | 'all';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class ResolveReportDto {
  @IsIn(['dismiss', 'warn', 'suspend', 'ban'])
  action: 'dismiss' | 'warn' | 'suspend' | 'ban';

  /** warn/suspend/ban için zorunlu (denetim izi) */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RestoreUserDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  note: string;
}

export class AlertQueueQuery {
  /** false verilirse işlenmişler de listelenir */
  @IsOptional()
  @IsIn(['true', 'false'])
  only_open?: 'true' | 'false';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class PhotoQueueQuery {
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected'])
  status?: 'pending' | 'approved' | 'rejected';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class ReviewPhotoDto {
  @IsIn(['approve', 'reject'])
  decision: 'approve' | 'reject';

  /** Ret için zorunlu (denetim izi) */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CafeQueueQuery {
  @IsOptional()
  @IsIn(['pending', 'active', 'suspended'])
  status?: 'pending' | 'active' | 'suspended';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class SetCafeStatusDto {
  @IsIn(['active', 'suspended'])
  status: 'active' | 'suspended';

  /** Askıya alma için zorunlu (denetim izi) */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
