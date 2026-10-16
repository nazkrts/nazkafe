import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class SafetyAlertDto {
  /** Rahatsız eden kişi (eşleşilmiş biri). Verilmezse yalnızca kafe uyarısı/kayıt oluşur. */
  @IsOptional()
  @IsUUID()
  other_user_id?: string;

  @IsOptional()
  @IsUUID()
  invitation_id?: string;

  /** Kafe ekibine sessizce haber verilsin mi? Kullanıcı açıkça onaylamalı. */
  @IsOptional()
  @IsBoolean()
  notify_cafe?: boolean;
}
