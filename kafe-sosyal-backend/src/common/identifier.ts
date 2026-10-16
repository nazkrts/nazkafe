import { hmacHex } from './crypto';

export type IdentifierKind = 'phone' | 'email';

export interface Identifier {
  kind: IdentifierKind;
  /** Normalize edilmiş değer: telefon için +90..., e-posta için küçük harf */
  value: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Telefon veya e-postayı normalize eder; geçersizse null. */
export function parseIdentifier(raw: string): Identifier | null {
  const s = (raw ?? '').trim();
  if (s.includes('@')) {
    const email = s.toLowerCase();
    return email.length <= 254 && EMAIL_RE.test(email) ? { kind: 'email', value: email } : null;
  }
  const compact = s.replace(/[\s\-().]/g, '');
  if (/^\+\d{8,15}$/.test(compact)) return { kind: 'phone', value: compact };
  if (/^0\d{10}$/.test(compact)) return { kind: 'phone', value: '+9' + compact }; // 05321234567
  if (/^90\d{10}$/.test(compact)) return { kind: 'phone', value: '+' + compact }; // 905321234567
  if (/^5\d{9}$/.test(compact)) return { kind: 'phone', value: '+90' + compact }; // 5321234567
  return null;
}

/** Telefon/e-posta için anahtarlı özet: Redis anahtarlarında ve users.phone_hash'te kullanılır. */
export const identifierHash = (id: Identifier, pepper: string): string =>
  hmacHex(pepper, `${id.kind}:${id.value}`);
