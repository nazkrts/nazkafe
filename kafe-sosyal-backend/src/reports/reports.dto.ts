import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { REPORT_CONTEXTS, REPORT_REASONS, ReportContext, ReportReason } from '../common/report-rules';

export class CreateReportDto {
  @IsUUID()
  reported_user_id: string;

  @IsIn(REPORT_CONTEXTS as unknown as string[])
  context: ReportContext;

  @IsIn(REPORT_REASONS as unknown as string[])
  reason: ReportReason;

  /** context=chat ise kanıt mesajı (isteğe bağlı) */
  @IsOptional()
  @IsUUID()
  message_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  details?: string;

  /** Şikâyetle birlikte engelle */
  @IsOptional()
  @IsBoolean()
  block?: boolean;
}
