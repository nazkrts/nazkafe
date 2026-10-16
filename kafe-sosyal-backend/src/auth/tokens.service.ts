import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { randomToken, sha256Hex } from '../common/crypto';
import { AppError } from '../common/errors';
import { Identifier } from '../common/identifier';
import { DbService } from '../db/db.service';
import { KV, KvStore } from '../kv/kv.store';

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

const ONBOARDING_TTL_SEC = 15 * 60;

@Injectable()
export class TokensService {
  constructor(
    private readonly jwt: JwtService,
    private readonly db: DbService,
    @Inject(KV) private readonly kv: KvStore,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  private get refreshTtlSec(): number {
    return this.cfg.refreshTtlDays * 86400;
  }

  async issue(userId: string): Promise<TokenPair> {
    const access = await this.jwt.signAsync(
      { sub: userId, role: 'user', typ: 'access' },
      { expiresIn: this.cfg.accessTtlSec },
    );
    // Refresh token opaktır; yalnızca özeti saklanır (sızıntıda ham token yok).
    const refresh = randomToken();
    const h = sha256Hex(refresh);
    await this.kv.set(`rt:${h}`, userId, this.refreshTtlSec);
    await this.kv.sadd(`urt:${userId}`, h, this.refreshTtlSec);
    return { access_token: access, refresh_token: refresh, expires_in: this.cfg.accessTtlSec };
  }

  /** Refresh token'ı tek kullanımlıktır: kullanılınca yenisi verilir. */
  async rotate(refreshToken: string): Promise<TokenPair> {
    const h = sha256Hex(refreshToken);
    const userId = await this.kv.get(`rt:${h}`);
    if (!userId) throw new AppError('TOKEN_INVALID', 'Oturum süresi doldu, yeniden giriş yap.', 401);
    await this.kv.del(`rt:${h}`);
    await this.kv.srem(`urt:${userId}`, h);

    const { rows } = await this.db.query(`SELECT status FROM users WHERE id = $1`, [userId]);
    if (!rows[0] || rows[0].status !== 'active') {
      throw new AppError('ACCOUNT_DISABLED', 'Hesabın şu anda kullanılamıyor.', 403);
    }
    return this.issue(userId);
  }

  async revoke(refreshToken: string): Promise<void> {
    const h = sha256Hex(refreshToken);
    const userId = await this.kv.get(`rt:${h}`);
    await this.kv.del(`rt:${h}`);
    if (userId) await this.kv.srem(`urt:${userId}`, h);
  }

  /** Askıya alma, yasaklama ve hesap silmede tüm oturumları kapatır. */
  async revokeAll(userId: string): Promise<void> {
    const hashes = await this.kv.smembers(`urt:${userId}`);
    await this.kv.del(...hashes.map((h) => `rt:${h}`), `urt:${userId}`);
  }

  signOnboarding(id: Identifier): Promise<string> {
    return this.jwt.signAsync({ typ: 'onboarding', k: id.kind, v: id.value }, { expiresIn: ONBOARDING_TTL_SEC });
  }

  async verifyOnboarding(token: string): Promise<Identifier> {
    try {
      const p = await this.jwt.verifyAsync(token, { algorithms: ['HS256'] });
      if (p.typ !== 'onboarding' || (p.k !== 'phone' && p.k !== 'email') || typeof p.v !== 'string') {
        throw new Error('wrong token type');
      }
      return { kind: p.k, value: p.v };
    } catch {
      throw new AppError('ONBOARDING_TOKEN_INVALID', 'Kayıt oturumunun süresi doldu, kodu yeniden iste.', 401);
    }
  }
}
