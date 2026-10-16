import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';

export const sha256Hex = (s: string): string => createHash('sha256').update(s).digest('hex');

export const hmacHex = (key: string | Buffer, data: string): string =>
  createHmac('sha256', key).update(data).digest('hex');

/** Sabit zamanlı karşılaştırma (uzunluklar farklıysa false). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** 6 haneli, kriptografik olarak güvenli OTP. */
export const randomOtp = (): string => randomInt(0, 1_000_000).toString().padStart(6, '0');

export const randomToken = (bytes = 48): string => randomBytes(bytes).toString('base64url');

/** AES-256-GCM. Çıktı: iv(12) | tag(16) | şifreli metin. */
export function encryptField(key: Buffer, plaintext: string): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]);
}

export function decryptField(key: Buffer, data: Buffer): string {
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const enc = data.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

// --- Parola özeti (yönetici hesapları): scrypt, sürüm/parametreler özetin içinde ---
const SCRYPT = { N: 16384, r: 8, p: 1 };
const scryptAsync = (pw: string, salt: Buffer, N: number, r: number, p: number): Promise<Buffer> =>
  new Promise((resolve, reject) =>
    scrypt(pw, salt, 32, { N, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key))),
  );

/** Biçim: scrypt$N$r$p$tuz(base64)$özet(base64) */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT.N, SCRYPT.r, SCRYPT.p);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
  try {
    const expected = Buffer.from(hash, 'base64');
    const key = await scryptAsync(password, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p));
    return key.length === expected.length && timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}
