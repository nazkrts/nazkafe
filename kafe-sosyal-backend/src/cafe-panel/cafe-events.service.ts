import { Injectable } from '@nestjs/common';
import { AppError } from '../common/errors';
import { buildEvent, EventFields } from '../common/event-rules';
import { DbService } from '../db/db.service';
import { CafeUser } from './cafe-auth.guard';
import { CAFE_EVENTS_SQL as SQL } from './cafe-events.sql';

const MAX_UPCOMING = 50;
const requireOwner = (u: CafeUser) => {
  if (u.role !== 'owner') throw new AppError('FORBIDDEN', 'Bu işlem yalnızca kafe sahibine açık.', 403);
};
const notFound = () => new AppError('EVENT_NOT_FOUND', 'Etkinlik bulunamadı.', 404);

@Injectable()
export class CafeEventsService {
  constructor(private readonly db: DbService) {}

  async list(u: CafeUser) {
    return { events: (await this.db.query(SQL.list, [u.cafeId])).rows };
  }

  async create(u: CafeUser, f: EventFields) {
    requireOwner(u);
    if (u.cafeStatus !== 'active') throw new AppError('CAFE_NOT_ACTIVE', 'Kafen henüz onaylanmadı.', 409);
    const e = buildEvent(f, new Date(), true);
    return this.db.tx(async (c) => {
      await c.query(SQL.lockCafe, [u.cafeId]);
      if ((await c.query(SQL.upcomingCount, [u.cafeId])).rows[0].n >= MAX_UPCOMING) {
        throw new AppError('EVENT_LIMIT', `En fazla ${MAX_UPCOMING} yaklaşan etkinlik olabilir.`, 409);
      }
      const row = (await c.query(SQL.insert, [u.cafeId, e.title, e.description, e.category, e.starts_at, e.ends_at, e.capacity])).rows[0];
      return { event: row };
    });
  }

  /** Düzenleme: yalnızca planlanmış ve bitmemiş etkinlik; kapasite mevcut katılımcı sayısının altına inemez. */
  async update(u: CafeUser, id: string, f: EventFields) {
    requireOwner(u);
    return this.db.tx(async (c) => {
      await c.query(SQL.lockEvent, [id]);
      const cur = (await c.query(SQL.one, [id, u.cafeId])).rows[0];
      if (!cur) throw notFound();
      if (cur.status !== 'scheduled' || new Date(cur.ends_at) <= new Date()) {
        throw new AppError('EVENT_CLOSED', 'Bu etkinlik düzenlenemez.', 409);
      }
      const has = (k: keyof EventFields) => f[k] !== undefined;
      const merged: EventFields = {
        title: has('title') ? f.title : cur.title,
        description: has('description') ? f.description : cur.description,
        category: has('category') ? f.category : cur.category,
        starts_at: has('starts_at') ? f.starts_at : new Date(cur.starts_at).toISOString(),
        ends_at: has('ends_at') ? f.ends_at : new Date(cur.ends_at).toISOString(),
        capacity: has('capacity') ? f.capacity : cur.capacity,
      };
      const e = buildEvent(merged, new Date(), has('starts_at'));
      if (e.capacity !== null && e.capacity < cur.attendee_count) {
        throw new AppError('CAPACITY_BELOW_ATTENDEES', `Kapasite mevcut katılımcı sayısının (${cur.attendee_count}) altına düşürülemez.`, 409);
      }
      const row = (await c.query(SQL.update, [id, u.cafeId, e.title, e.description, e.category, e.starts_at, e.ends_at, e.capacity])).rows[0];
      return { event: row };
    });
  }

  async cancel(u: CafeUser, id: string): Promise<{ ok: true }> {
    requireOwner(u);
    const r = await this.db.query(SQL.cancel, [id, u.cafeId]);
    if (!r.rows[0]) {
      const exists = await this.db.query(SQL.one, [id, u.cafeId]);
      throw exists.rows[0] ? new AppError('EVENT_CLOSED', 'Bu etkinlik iptal edilemez.', 409) : notFound();
    }
    return { ok: true };
  }
}
