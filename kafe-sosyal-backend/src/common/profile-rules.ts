import { detectContactInfo } from './contact-filter';
import { AppError } from './errors';

const NAME_RE = /^\p{L}[\p{L}'’.-]*(?: \p{L}[\p{L}'’.-]*)?$/u;
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0008\u000B-\u001F\u007F]/;

/** Görünen ad: yalnızca ad (en fazla iki sözcük), iletişim bilgisi içermez. */
export function validateDisplayName(raw: string): string {
  const name = (raw ?? '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 30 || !NAME_RE.test(name) || detectContactInfo(name)) {
    throw new AppError(
      'INVALID_DISPLAY_NAME',
      'Yalnızca adını yaz (2-30 harf, en fazla iki sözcük). Soyadı, numara veya kullanıcı adı ekleme.',
      422,
    );
  }
  return name;
}

/** Bio: en fazla 200 karakter, iletişim bilgisi (telefon, e-posta, Instagram vb.) yok. */
export function validateBio(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const bio = raw.trim();
  if (bio === '') return null;
  if ([...bio].length > 200 || CONTROL_RE.test(bio)) {
    throw new AppError('INVALID_BIO', 'Bio en fazla 200 karakter olabilir.', 422);
  }
  if (detectContactInfo(bio)) {
    throw new AppError(
      'CONTACT_INFO_NOT_ALLOWED',
      'Bio içinde telefon, e-posta veya kullanıcı adı paylaşma. Bunları tanıştıktan sonra sohbette paylaşabilirsin.',
      422,
    );
  }
  return bio;
}
