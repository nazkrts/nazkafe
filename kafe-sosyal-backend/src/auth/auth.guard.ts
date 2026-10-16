import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppError } from '../common/errors';
import { DbService } from '../db/db.service';
import { AUTH_SQL } from './auth.sql';

export interface AuthUser {
  id: string;
}

/**
 * Bearer access token'ı doğrular ve kullanıcının hâlâ 'active' olduğunu her istekte kontrol eder;
 * askıya alınan/yasaklanan kullanıcı, token süresi dolmadan da hemen dışarıda kalır.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly db: DbService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new AppError('UNAUTHORIZED', 'Giriş yapmalısın.', 401);

    let payload: any;
    try {
      payload = await this.jwt.verifyAsync(token, { algorithms: ['HS256'] });
    } catch {
      throw new AppError('UNAUTHORIZED', 'Oturumun geçersiz veya süresi dolmuş.', 401);
    }
    if (payload?.typ !== 'access' || payload?.role !== 'user' || typeof payload?.sub !== 'string') {
      throw new AppError('UNAUTHORIZED', 'Oturumun geçersiz.', 401);
    }

    const { rows } = await this.db.query(AUTH_SQL.userStatus, [payload.sub]);
    if (!rows[0]) throw new AppError('UNAUTHORIZED', 'Oturumun geçersiz.', 401);
    if (rows[0].status !== 'active') {
      throw new AppError('ACCOUNT_DISABLED', 'Hesabın şu anda kullanılamıyor.', 403);
    }
    req.user = { id: rows[0].id } satisfies AuthUser;
    return true;
  }
}
