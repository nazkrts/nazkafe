import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { checkLogin } from '../common/login-throttle';
import { DbService } from '../db/db.service';
import { KV, KvStore } from '../kv/kv.store';
import { CAFE_PANEL_SQL as SQL } from './cafe-panel.sql';

/** Kafe paneli bir tablette gün boyu açık kalabilir; bu yüzden yönetici token'ından uzun. Her istekte hesap yeniden denetlenir. */
export const CAFE_TOKEN_TTL_SEC = 12 * 3600;

@Injectable()
export class CafeAuthService {
  constructor(
    private readonly db: DbService,
    private readonly jwt: JwtService,
    @Inject(KV) private readonly kv: KvStore,
  ) {}

  async login(emailRaw: string, password: string, ip: string) {
    const email = emailRaw.trim().toLowerCase();
    const a = (await this.db.query(SQL.accountByEmail, [email])).rows[0];
    await checkLogin(this.kv, 'cafe', ip, email, password, a && { passwordHash: a.password_hash, usable: a.status === 'active' && a.cafe_status !== 'suspended' });
    await this.db.query(SQL.touchLogin, [a.id]);
    const access_token = await this.jwt.signAsync({ sub: a.id, role: 'cafe', typ: 'access' }, { expiresIn: CAFE_TOKEN_TTL_SEC });
    return { access_token, expires_in: CAFE_TOKEN_TTL_SEC, account: { id: a.id, role: a.role, cafe_id: a.cafe_id, cafe_status: a.cafe_status } };
  }
}
