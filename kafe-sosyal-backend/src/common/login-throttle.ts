import { hashPassword, verifyPassword } from './crypto';
import { AppError } from './errors';
import { allow, KvStore } from '../kv/kv.store';

const LOCK_SEC = 15 * 60;
const MAX_FAILS = 5;
const MAX_PER_IP = 20;
// Hesap yoksa da aynı sürede parola doğrulanır (hesap varlığı süreden anlaşılmasın)
let DUMMY_HASH: Promise<string> | undefined;

export interface LoginAccount {
  passwordHash: string;
  /** Hesap giriş yapmaya uygun mu (devre dışı/askıda değil) */
  usable: boolean;
}

/**
 * Parola ile girişlerin ortak koruması (yönetici ve kafe paneli): IP başına 15 dakikada 20 deneme,
 * e-posta başına 5 hatalı denemede 15 dakika kilit, hesap yoksa da sabit süreli doğrulama.
 * Başarılıysa true döner; her başarısızlık aynı `INVALID_CREDENTIALS` hatasıdır.
 */
export async function checkLogin(
  kv: KvStore,
  scope: string,
  ip: string,
  email: string,
  password: string,
  account: LoginAccount | undefined,
): Promise<void> {
  if (!(await allow(kv, `rl:${scope}login:ip:${ip}`, MAX_PER_IP, LOCK_SEC))) {
    throw new AppError('TOO_MANY_REQUESTS', 'Çok fazla deneme. Daha sonra tekrar dene.', 429);
  }
  const failKey = `${scope}fail:${email}`;
  if (Number((await kv.get(failKey)) ?? 0) >= MAX_FAILS) {
    throw new AppError('TOO_MANY_REQUESTS', 'Çok fazla hatalı deneme. 15 dakika sonra tekrar dene.', 429);
  }
  DUMMY_HASH ??= hashPassword('dummy-password-for-timing');
  const ok = await verifyPassword(password, account?.passwordHash ?? (await DUMMY_HASH));
  if (!account || !ok || !account.usable) {
    await kv.incr(failKey, LOCK_SEC);
    throw new AppError('INVALID_CREDENTIALS', 'E-posta veya parola hatalı.', 401);
  }
  await kv.del(failKey);
}
