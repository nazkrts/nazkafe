import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../common/errors';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { CheckinsService, ActiveCheckin, noActiveCheckin } from '../checkins/checkins.service';
import { DbService } from '../db/db.service';
import { allow, KV, KvStore } from '../kv/kv.store';
import { DISCOVER_SQL as SQL } from './discover.sql';

const LIST_LIMIT = 50;
const targetGone = () => new AppError('TARGET_UNAVAILABLE', 'Bu kişi artık listede değil.', 404);

@Injectable()
export class DiscoverService {
  constructor(
    private readonly db: DbService,
    private readonly checkins: CheckinsService,
    @Inject(KV) private readonly kv: KvStore,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  /** Keşfi görmek için aktif check-in ve açık görünürlük gerekir (karşılıklılık). */
  private async requireVisible(userId: string): Promise<ActiveCheckin> {
    const ck = await this.checkins.getActive(userId);
    if (!ck) throw noActiveCheckin();
    if (!ck.visible) {
      throw new AppError('VISIBILITY_OFF', 'Diğer kişileri görmek için "Görünür ol" seçeneğini açmalısın.', 409);
    }
    return ck;
  }

  private async throttle(userId: string): Promise<void> {
    if (!(await allow(this.kv, `rl:act:${userId}`, 60, 60))) {
      throw new AppError('TOO_MANY_REQUESTS', 'Çok hızlı gidiyorsun, biraz bekle.', 429);
    }
  }

  async list(userId: string) {
    const ck = await this.requireVisible(userId);
    const { rows } = await this.db.query(SQL.list, [
      userId,
      ck.cafe_id,
      ck.id,
      this.cfg.requireApprovedPhoto,
      LIST_LIMIT,
    ]);
    return {
      cafe: { id: ck.cafe_id, name: ck.cafe_name },
      people: rows.map((r) => ({
        user_id: r.user_id,
        display_name: r.display_name,
        age: r.age,
        photo_verified: r.photo_verified,
        photo_key: r.photo_key,
        common_interests: r.common_interests,
      })),
    };
  }

  /**
   * "Tanışalım". Karşı taraf eşleşme olana kadar hiçbir şey öğrenmez ve bildirim almaz;
   * eşleşme yoksa yanıt her zaman `{ ok: true }` olur (nedeni sızdırmaz).
   */
  async like(userId: string, targetId: string): Promise<{ ok: true } | { matched: true; match_id: string }> {
    if (userId === targetId) throw targetGone();
    await this.throttle(userId);
    const ck = await this.requireVisible(userId);
    const pairKey = [userId, targetId].sort().join(':');

    return this.db.tx(async (c) => {
      await c.query(SQL.lockPair, [pairKey]);

      const present = await c.query(SQL.targetPresent, [targetId, ck.cafe_id, userId]);
      if (!present.rows[0]) throw targetGone();

      const inserted = await c.query(SQL.insertAction, [userId, targetId, ck.cafe_id, ck.id, 'like']);
      if (inserted.rows[0]) {
        const count = await c.query(SQL.likeCount, [userId, ck.id]);
        if (count.rows[0].n > this.cfg.likeLimitPerCheckin) {
          throw new AppError('LIKE_LIMIT', 'Bu check-in için tanışma hakkın doldu.', 429);
        }
      }

      const mutual = await c.query(SQL.reciprocal, [targetId, userId, ck.cafe_id]);
      if (!mutual.rows[0]) return { ok: true as const };

      await c.query(SQL.insertMatch, [userId, targetId, ck.cafe_id]);
      const match = (await c.query(SQL.existingMatch, [userId, targetId])).rows[0];
      // Daha önce bitirilmiş/engellenmiş bir eşleşme yeniden açılmaz ve bunun nedeni belli edilmez
      if (!match || match.status !== 'active') return { ok: true as const };
      return { matched: true as const, match_id: match.id as string };
    });
  }

  /** "Geç": bu check-in boyunca o kişi listede bir daha çıkmaz. */
  async pass(userId: string, targetId: string): Promise<{ ok: true }> {
    if (userId === targetId) throw targetGone();
    await this.throttle(userId);
    const ck = await this.checkins.getActive(userId);
    if (!ck) throw noActiveCheckin();
    const exists = await this.db.query(SQL.userActive, [targetId]);
    if (!exists.rows[0]) throw targetGone();
    await this.db.query(SQL.insertAction, [userId, targetId, ck.cafe_id, ck.id, 'pass']);
    return { ok: true };
  }
}
