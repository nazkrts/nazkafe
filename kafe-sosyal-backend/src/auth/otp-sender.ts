import { Logger } from '@nestjs/common';
import { AppError } from '../common/errors';
import { Identifier } from '../common/identifier';

export const OTP_SENDER = Symbol('OTP_SENDER');

/** SMS veya e-posta sağlayıcısı bu arayüzü uygular (Netgsm, İleti Merkezi, SES vb.). */
export interface OtpSender {
  send(to: Identifier, code: string): Promise<void>;
}

/** Yalnızca geliştirme: kodu sunucu loguna yazar. Production'da kullanılmaz. */
export class ConsoleOtpSender implements OtpSender {
  private readonly log = new Logger('OTP');

  async send(to: Identifier, code: string): Promise<void> {
    this.log.warn(`[GELİŞTİRME] ${to.kind} ${to.value} için doğrulama kodu: ${code}`);
  }
}

/** Production'da gerçek sağlayıcı bağlanana kadar kod göndermeyi reddeder. */
export class UnconfiguredOtpSender implements OtpSender {
  async send(): Promise<void> {
    throw new AppError('OTP_PROVIDER_MISSING', 'Doğrulama kodu gönderimi şu an yapılamıyor.', 503);
  }
}
