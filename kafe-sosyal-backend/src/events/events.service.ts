import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../common/errors';
import { DbService } from '../db/db.service';
import { allow, KV, KvStore } from '../kv/kv.store';
import { EVENTS_SQL as SQL } from './events.sql';

@Injectable()
export class EventsService {
  constructor(
    private readonly db: DbService,
    @Inject(KV) private readonly kv: KvStore,
  ) {}

  /**
   * Etkinliğe katıl. Aynı kullanıcı tekrar katılırsa zararsızdır. Katılımcı listesi başkalarına gösterilmez;
   * kapasite doluluk kontrolü işlem içinde etkinlik başına kilitle yapılır (fazla kayıt olmaz).
   */
  async join(userId: string, eventId: string): Promise<{ ok: true }> {
    if (!(await allow(this.kv, `rl:evjoin:${userId}`, 30, 3600))) {
      throw new AppError('TOO_MANY_REQUESTS', 'Çok fazla etkinlik işlemi yaptın.', 429);
    }
    await this.db.tx(async (c) => {
      await c.query(SQL.lockEvent, [eventId]);
      const e = (await c.query(SQL.forJoin, [eventId])).rows[0];
      if (!e || e.cafe_status !== 'active') throw new AppError('EVENT_NOT_FOUND', 'Etkinlik bulunamadı.', 404);
      if (e.status !== 'scheduled' || new Date(e.ends_at) <= new Date()) {
        throw new AppError('EVENT_CLOSED', 'Bu etkinlik artık katılıma açık değil.', 409);
      }
      if (e.capacity !== null && (await c.query(SQL.attendeeCount, [eventId])).rows[0].n >= e.capacity) {
        const already = await c.query(`SELECT 1 FROM event_attendees WHERE event_id = $1::uuid AND user_id = $2::uuid`, [eventId, userId]);
        if (!already.rows[0]) throw new AppError('EVENT_FULL', 'Etkinlik dolu.', 409);
        return;
      }
      await c.query(SQL.join, [eventId, userId]);
    });
    return { ok: true };
  }

  async leave(userId: string, eventId: string): Promise<{ ok: true }> {
    await this.db.query(SQL.leave, [eventId, userId]);
    return { ok: true };
  }

  async mine(userId: string) {
    return { events: (await this.db.query(SQL.mine, [userId])).rows };
  }
}
