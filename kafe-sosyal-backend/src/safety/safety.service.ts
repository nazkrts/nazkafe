import { Inject, Injectable } from '@nestjs/common';
import { CheckinsService } from '../checkins/checkins.service';
import { AppError } from '../common/errors';
import { DbService } from '../db/db.service';
import { allow, KV, KvStore } from '../kv/kv.store';
import { SAFETY_SQL as SQL } from './safety.sql';

export const EMERGENCY_NUMBER = '112';

@Injectable()
export class SafetyService {
  constructor(
    private readonly db: DbService,
    private readonly checkins: CheckinsService,
    @Inject(KV) private readonly kv: KvStore,
  ) {}

  /**
   * "Rahatsızım": tek dokunuşla; karşı tarafı engeller, eşleşmeyi ve davetleri kapatır, yüksek öncelikli
   * şikâyet açar, istenirse kafe ekibine haber kaydı bırakır. Yanıt karşı tarafa hiçbir şey göstermez.
   * Kafe ekibine kullanıcının kimliği değil, yalnızca uyarının varlığı iletilmelidir (kafe paneli işi).
   */
  async alert(userId: string, input: { other_user_id?: string; invitation_id?: string; notify_cafe?: boolean }) {
    if (!(await allow(this.kv, `rl:alert:${userId}`, 5, 3600))) {
      throw new AppError('TOO_MANY_REQUESTS', 'Çok fazla uyarı gönderdin.', 429);
    }
    const ck = await this.checkins.getActive(userId);
    if (!ck) throw new AppError('NO_ACTIVE_CHECKIN', 'Uyarı için kafede check-in yapmış olmalısın.', 409);

    let otherId = input.other_user_id ?? null;
    let invitationId: string | null = null;
    if (input.invitation_id) {
      const inv = (await this.db.query(SQL.invitationOf, [input.invitation_id, userId])).rows[0];
      if (!inv) throw new AppError('INVITATION_NOT_FOUND', 'Davet bulunamadı.', 404);
      invitationId = inv.id;
      const fromInv = inv.from_user_id === userId ? inv.to_user_id : inv.from_user_id;
      if (otherId && otherId !== fromInv) throw new AppError('TARGET_UNAVAILABLE', 'Kullanıcı bulunamadı.', 404);
      otherId = fromInv;
    }
    if (otherId) {
      if (otherId === userId) throw new AppError('TARGET_UNAVAILABLE', 'Kullanıcı bulunamadı.', 404);
      if (!(await this.db.query(SQL.matchBetween, [userId, otherId])).rows[0]) {
        throw new AppError('TARGET_UNAVAILABLE', 'Kullanıcı bulunamadı.', 404);
      }
    }
    const notifyCafe = input.notify_cafe === true;

    await this.db.tx(async (c) => {
      await c.query(SQL.insertAlert, [userId, otherId, ck.cafe_id, invitationId, notifyCafe]);
      if (otherId) {
        await c.query(SQL.insertBlock, [userId, otherId]);
        await c.query(SQL.blockMatch, [userId, otherId]);
        await c.query(SQL.cancelInvitations, [userId, otherId]);
        await c.query(SQL.insertReport, [userId, otherId, invitationId ? 'invitation' : 'chat']);
      }
    });
    return { ok: true, blocked: otherId !== null, cafe_notified: notifyCafe, emergency_number: EMERGENCY_NUMBER };
  }
}
