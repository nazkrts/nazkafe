import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { checkLogin } from '../common/login-throttle';
import { DbService } from '../db/db.service';
import { KV, KvStore } from '../kv/kv.store';
import { ADMIN_SQL } from './admin.sql';

export const ADMIN_TOKEN_TTL_SEC = 30 * 60;

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly db: DbService,
    private readonly jwt: JwtService,
    @Inject(KV) private readonly kv: KvStore,
  ) {}

  async login(emailRaw: string, password: string, ip: string) {
    const email = emailRaw.trim().toLowerCase();
    const admin = (await this.db.query(ADMIN_SQL.byEmail, [email])).rows[0];
    await checkLogin(this.kv, 'admin', ip, email, password, admin && { passwordHash: admin.password_hash, usable: admin.status === 'active' });
    await this.db.query(ADMIN_SQL.touchLogin, [admin.id]);
    const access_token = await this.jwt.signAsync(
      { sub: admin.id, role: 'admin', typ: 'access' },
      { expiresIn: ADMIN_TOKEN_TTL_SEC },
    );
    return { access_token, expires_in: ADMIN_TOKEN_TTL_SEC, admin: { id: admin.id, display_name: admin.display_name, role: admin.role } };
  }
}
