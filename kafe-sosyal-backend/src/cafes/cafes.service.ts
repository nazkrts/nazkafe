import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../common/errors';
import { isOpenAt } from '../common/opening-hours';
import { formatCount } from '../common/privacy';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { DbService } from '../db/db.service';
import { CAFES_SQL } from './cafes.sql';

/** LIKE joker karakterlerini kaçırır: kullanıcı '%' yazarak tüm listeyi çekemesin. */
const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (m) => '\\' + m);

@Injectable()
export class CafesService {
  constructor(
    private readonly db: DbService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  async list(filter: { city?: string; district?: string; q?: string }, limit = 30) {
    const { rows } = await this.db.query(CAFES_SQL.list, [
      filter.city ? escapeLike(filter.city.trim()) : null,
      filter.district ? escapeLike(filter.district.trim()) : null,
      filter.q ? escapeLike(filter.q.trim()) : null,
      Math.min(Math.max(limit, 1), 50),
    ]);
    const now = new Date();
    return {
      cafes: rows.map((c) => ({
        id: c.id,
        name: c.name,
        branch_name: c.branch_name,
        description: c.description,
        address: c.address,
        city: c.city,
        district: c.district,
        is_open_now: isOpenAt(c.opening_hours, now, this.cfg.timezone),
        // Ham sayı gönderilmez: kovalanmış etiketler (privacy.formatCount)
        social_open: formatCount(c.open_count),
        checkins: formatCount(c.checkin_count),
      })),
    };
  }

  async detail(id: string, userId?: string) {
    const { rows } = await this.db.query(CAFES_SQL.byId, [id]);
    const c = rows[0];
    if (!c) throw new AppError('CAFE_NOT_FOUND', 'Kafe bulunamadı.', 404);
    const [points, events] = await Promise.all([
      this.db.query(CAFES_SQL.meetingPointCount, [id]),
      this.db.query(CAFES_SQL.upcomingEvents, [id, 5, userId ?? null]),
    ]);
    return {
      id: c.id,
      name: c.name,
      branch_name: c.branch_name,
      description: c.description,
      address: c.address,
      city: c.city,
      district: c.district,
      opening_hours: c.opening_hours,
      is_open_now: isOpenAt(c.opening_hours, new Date(), this.cfg.timezone),
      meeting_points_count: points.rows[0].n,
      upcoming_events: events.rows,
    };
  }

  async events(id: string, userId?: string) {
    const exists = await this.db.query(CAFES_SQL.byId, [id]);
    if (!exists.rows[0]) throw new AppError('CAFE_NOT_FOUND', 'Kafe bulunamadı.', 404);
    const { rows } = await this.db.query(CAFES_SQL.upcomingEvents, [id, 20, userId ?? null]);
    return { events: rows };
  }
}
