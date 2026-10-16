import { Injectable } from '@nestjs/common';
import { AppError } from '../common/errors';
import { DbService } from '../db/db.service';
import { AdminUser } from './admin-auth.guard';
import { ADMIN_SQL as SQL } from './admin.sql';

@Injectable()
export class AdminCafesService {
  constructor(private readonly db: DbService) {}

  /** Onay kuyruğu: yönetici işletmeyi doğrulayabilsin diye sahip e-postası görünür (işletme e-postası, kullanıcı verisi değil). */
  async queue(status: 'pending' | 'active' | 'suspended' = 'pending', limit = 20) {
    return { cafes: (await this.db.query(SQL.cafeQueue, [status, Math.min(limit, 50)])).rows };
  }

  /** Kafe onayı/askıya alma yalnızca `admin` rolünde; her işlem denetim kaydına yazılır. */
  async setStatus(admin: AdminUser, cafeId: string, status: 'active' | 'suspended', noteRaw?: string) {
    if (admin.role !== 'admin') throw new AppError('FORBIDDEN', 'Kafe onayı yalnızca yöneticilere açık.', 403);
    const note = noteRaw?.trim() ?? '';
    if (status === 'suspended' && note.length < 3) throw new AppError('NOTE_REQUIRED', 'Askıya alma için gerekçe yazmalısın.', 422);
    await this.db.tx(async (c) => {
      const r = await c.query(SQL.setCafeStatus, [cafeId, status]);
      if (!r.rows[0]) {
        const e = await c.query(SQL.cafeExists, [cafeId]);
        throw e.rows[0] ? new AppError('CAFE_UNCHANGED', 'Kafe zaten bu durumda.', 409) : new AppError('CAFE_NOT_FOUND', 'Kafe bulunamadı.', 404);
      }
      if (status === 'suspended') {
        await c.query(SQL.endCafeCheckins, [cafeId]);
        await c.query(SQL.cancelCafeInvitations, [cafeId]);
      }
      await c.query(SQL.logAction, [admin.id, null, null, status === 'active' ? 'cafe_activate' : 'cafe_suspend', `${r.rows[0].name} (${cafeId})${note ? ': ' + note : ''}`]);
    });
    return { ok: true, status };
  }
}
