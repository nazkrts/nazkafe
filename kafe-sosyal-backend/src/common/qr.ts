import { createHmac, timingSafeEqual } from 'node:crypto';

export type QrVerdict = 'ok' | 'expired' | 'invalid';

export const qrWindowOf = (nowMs: number, windowSeconds: number): number =>
  Math.floor(nowMs / 1000 / windowSeconds);

/** Kafe sırrından, o zaman penceresi için kısa ve tahmin edilemez token üretir (22 karakter ≈ 132 bit). */
export function qrTokenFor(secret: Buffer | string, cafeId: string, window: number): string {
  return createHmac('sha256', secret).update(`${cafeId}:${window}`).digest('base64url').slice(0, 22);
}

function same(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Dönen QR doğrulaması.
 * - ok: şu anki pencere veya `tolerance` kadar önceki pencere (saat farkı ve tarama süresi payı)
 * - expired: daha eski ama gerçekten bu kafenin geçmiş bir token'ı (fotoğraftan paylaşılmış QR işareti)
 * - invalid: hiçbiri
 * Tüm pencereler her zaman hesaplanır, böylece süre sonucu belli etmez.
 */
export function verifyQrToken(
  secret: Buffer | string,
  cafeId: string,
  token: string,
  nowMs: number,
  windowSeconds: number,
  tolerance = 1,
  expiredLookback = 12,
): QrVerdict {
  const current = qrWindowOf(nowMs, windowSeconds);
  let ok = false;
  let expired = false;
  for (let back = 0; back <= tolerance + expiredLookback; back++) {
    if (same(qrTokenFor(secret, cafeId, current - back), token)) {
      if (back <= tolerance) ok = true;
      else expired = true;
    }
  }
  return ok ? 'ok' : expired ? 'expired' : 'invalid';
}
