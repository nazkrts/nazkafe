import { Inject, Injectable } from '@nestjs/common';
import { floorToGroup } from '../common/event-rules';
import { MIN_GROUP_SIZE } from '../common/privacy';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { DbService } from '../db/db.service';
import { CafeUser } from './cafe-auth.guard';
import { CAFE_EVENTS_SQL as SQL } from './cafe-events.sql';

@Injectable()
export class CafeStatsService {
  constructor(
    private readonly db: DbService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  /**
   * Toplulaştırılmış istatistik. Hiçbir kişi veya küçük grup görünmez: her saat/gün/niyet kovası en az
   * 5 check-in içermiyorsa hiç gösterilmez; toplam 5'in katına aşağı yuvarlanır (gizlenen kovalar
   * toplamdan çıkarılarak geri hesaplanamasın diye). Etkinlik katılımı gönüllüdür, sayı olarak görünür.
   */
  async stats(u: CafeUser, daysRaw = 7) {
    const days = Math.min(Math.max(daysRaw, 1), 90);
    const args = [u.cafeId, days, this.cfg.timezone];
    const [total, hours, weekdays, intents, events] = await Promise.all([
      this.db.query(SQL.total, [u.cafeId, days]),
      this.db.query(SQL.byHour, args),
      this.db.query(SQL.byWeekday, args),
      this.db.query(SQL.intents, [u.cafeId, days]),
      this.db.query(SQL.eventStats, [u.cafeId]),
    ]);
    return {
      period_days: days,
      min_group_size: MIN_GROUP_SIZE,
      total_checkins_at_least: floorToGroup(total.rows[0].n, MIN_GROUP_SIZE),
      by_hour: hours.rows.map((r) => ({ hour: r.hour, count: r.n })),
      by_weekday: weekdays.rows.map((r) => ({ weekday: r.weekday, count: r.n })),   // 0 = pazar
      intents: intents.rows.map((r) => ({ slug: r.slug, label: r.label, count: r.n })),
      events: events.rows,
    };
  }
}
