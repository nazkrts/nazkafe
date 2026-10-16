import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppError } from '../common/errors';
import { DbService } from '../db/db.service';
import { ADMIN_SQL } from './admin.sql';

export interface AdminUser {
  id: string;
  role: 'moderator' | 'admin';
}

/** Yalnızca role='admin' token'ları kabul eder; yönetici devre dışı bırakılınca hemen dışarıda kalır. */
@Injectable()
export class AdminAuthGuard implements CanActivate {
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
    if (payload?.typ !== 'access' || payload?.role !== 'admin' || typeof payload?.sub !== 'string') {
      throw new AppError('UNAUTHORIZED', 'Oturumun geçersiz.', 401);
    }
    const { rows } = await this.db.query(ADMIN_SQL.byId, [payload.sub]);
    if (!rows[0] || rows[0].status !== 'active') throw new AppError('UNAUTHORIZED', 'Oturumun geçersiz.', 401);
    req.admin = { id: rows[0].id, role: rows[0].role } satisfies AdminUser;
    return true;
  }
}
