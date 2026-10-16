import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { hmacHex, randomOtp, safeEqual } from '../common/crypto';
import { AppError } from '../common/errors';
import { identifierHash, parseIdentifier } from '../common/identifier';
import { DbService } from '../db/db.service';
import { allow, KV, KvStore } from '../kv/kv.store';
import { OTP_SENDER, OtpSender } from './otp-sender';
import { AUTH_SQL } from './auth.sql';
import { TokenPair, TokensService } from './tokens.service';

const OTP_TTL_SEC = 300;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_SEC = 60;

export type VerifyResult =
  | ({ onboarding_required: false } & TokenPair)
  | { onboarding_required: true; onboarding_token: string };

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DbService,
    private readonly tokens: TokensService,
    @Inject(KV) private readonly kv: KvStore,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    @Inject(OTP_SENDER) private readonly sender: OtpSender,
  ) {}

  private parseOrThrow(raw: string) {
    const id = parseIdentifier(raw);
    if (!id) throw new AppError('INVALID_IDENTIFIER', 'Geçerli bir telefon numarası veya e-posta gir.', 422);
    return id;
  }

  /**
   * Her zaman aynı yanıtı verir: kullanıcının kayıtlı olup olmadığı sızmaz.
   * Aynı adrese 60 sn içinde ikinci istek sessizce yok sayılır.
   */
  async requestOtp(raw: string, ip: string): Promise<{ ok: true; expires_in: number }> {
    const id = this.parseOrThrow(raw);
    const h = identifierHash(id, this.cfg.phonePepper);

    const allowed =
      (await allow(this.kv, `rl:otp:id:${h}`, 5, 3600)) && (await allow(this.kv, `rl:otp:ip:${ip}`, 30, 3600));
    if (!allowed) throw new AppError('TOO_MANY_REQUESTS', 'Çok fazla deneme yaptın. Lütfen daha sonra tekrar dene.', 429);

    const response = { ok: true as const, expires_in: OTP_TTL_SEC };
    if (await this.kv.get(`otp:cd:${h}`)) return response;

    const code = randomOtp();
    await this.kv.set(`otp:cd:${h}`, '1', OTP_RESEND_COOLDOWN_SEC);
    await this.kv.set(`otp:${h}`, hmacHex(this.cfg.phonePepper, `otp:${h}:${code}`), OTP_TTL_SEC);
    await this.kv.del(`otp:att:${h}`);
    try {
      await this.sender.send(id, code);
    } catch (err) {
      await this.kv.del(`otp:${h}`, `otp:cd:${h}`);
      throw err;
    }
    return response;
  }

  async verifyOtp(raw: string, code: string): Promise<VerifyResult> {
    const id = this.parseOrThrow(raw);
    const h = identifierHash(id, this.cfg.phonePepper);

    if ((await this.kv.incr(`otp:att:${h}`, OTP_TTL_SEC)) > OTP_MAX_ATTEMPTS) {
      await this.kv.del(`otp:${h}`);
      throw new AppError('TOO_MANY_ATTEMPTS', 'Çok fazla hatalı deneme. Yeni kod iste.', 429);
    }
    const stored = await this.kv.get(`otp:${h}`);
    const given = hmacHex(this.cfg.phonePepper, `otp:${h}:${(code ?? '').trim()}`);
    if (!stored || !safeEqual(stored, given)) {
      throw new AppError('OTP_INVALID', 'Kod geçersiz veya süresi dolmuş.', 400);
    }
    await this.kv.del(`otp:${h}`, `otp:att:${h}`);

    const found =
      id.kind === 'phone'
        ? await this.db.query(AUTH_SQL.findUserByPhoneHash, [h])
        : await this.db.query(AUTH_SQL.findUserByEmail, [id.value]);
    const user = found.rows[0];

    if (!user) {
      return { onboarding_required: true, onboarding_token: await this.tokens.signOnboarding(id) };
    }
    if (user.status !== 'active') {
      throw new AppError('ACCOUNT_DISABLED', 'Hesabın şu anda kullanılamıyor.', 403);
    }
    return { onboarding_required: false, ...(await this.tokens.issue(user.id)) };
  }

  refresh(refreshToken: string): Promise<TokenPair> {
    return this.tokens.rotate(refreshToken);
  }

  logout(refreshToken: string): Promise<void> {
    return this.tokens.revoke(refreshToken);
  }
}
