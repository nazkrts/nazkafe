import { ContactKind, detectContactInfo } from './contact-filter';
import { AppError } from './errors';

export const MAX_MESSAGE_CHARS = 1000;
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

/**
 * Sohbet mesajı doğrulaması. Bio'dan farklı olarak iletişim bilgisi engellenmez (kişi tanıştıktan sonra
 * kendi kararıyla paylaşabilir); yalnızca işaretlenir ve gönderene uyarı gösterilir.
 */
export function validateMessageBody(raw: string): { body: string; contact: ContactKind | null } {
  const body = (raw ?? '').trim();
  if (body === '') throw new AppError('INVALID_MESSAGE', 'Mesaj boş olamaz.', 422);
  if ([...body].length > MAX_MESSAGE_CHARS || CONTROL_RE.test(body)) {
    throw new AppError('INVALID_MESSAGE', `Mesaj en fazla ${MAX_MESSAGE_CHARS} karakter olabilir.`, 422);
  }
  return { body, contact: detectContactInfo(body) };
}
