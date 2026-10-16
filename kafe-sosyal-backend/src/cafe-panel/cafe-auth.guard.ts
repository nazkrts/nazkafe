import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppError } from '../common/errors';
import { DbService } from '../db/db.service';
import { CAFE_PANEL_SQL } from './cafe-panel.sql';

export interface CafeUser {
  accountId: string;
  cafeId: string;
  role: 'owner' | 'staff';
  cafeStatus: 'pending' | 'active' | 'suspended';
}

/** Yalnızca role='cafe' token'ları; hesap devre dışı veya kafe askıdaysa her istekte reddedilir. */
@Injectable()
export class CafeAuthGuard implements CanActivate {
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
    if (payload?.typ !== 'access' || payload?.role !== 'cafe' || typeof payload?.sub !== 'string') {
      throw new AppError('UNAUTHORIZED', 'Oturumun geçersiz.', 401);
    }
    const a = (await this.db.query(CAFE_PANEL_SQL.accountById, [payload.sub])).rows[0];
    if (!a || a.status !== 'active') throw new AppError('UNAUTHORIZED', 'Oturumun geçersiz.', 401);
    if (a.cafe_status === 'suspended') throw new AppError('CAFE_SUSPENDED', 'Bu kafe hesabı askıya alınmış.', 403);
    req.cafe = { accountId: a.id, cafeId: a.cafe_id, role: a.role, cafeStatus: a.cafe_status } satisfies CafeUser;
    return true;
  }
}
