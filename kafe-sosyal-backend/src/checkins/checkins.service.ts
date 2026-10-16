import { Inject, Injectable } from '@nestjs/common';
import { AppError, pgCode } from '../common/errors';
import { isOpenAt } from '../common/opening-hours';
import { verifyQrToken } from '../common/qr';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { DbService } from '../db/db.service';
import { allow, KV, KvStore } from '../kv/kv.store';
import { CHECKINS_SQL as SQL } from './checkins.sql';

export interface ActiveCheckin {
  id: string;
  cafe_id: string;
  visible: boolean;
  started_at: Date | string;
  expires_at: Date | string;
  cafe_name: string;
}

export const noActiveCheckin = () =>
  new AppError('NO_ACTIVE_CHECKIN', 'Önce bir kafede check-in yapmalısın.', 409);

@Injectable()
export class CheckinsService {
  constructor(
    private readonly db: DbService,
    @Inject(KV) private readonly kv: KvStore,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  /** Süresi dolmamış ve bitirilmemiş check-in; yoksa null. */
  async getActive(userId: string): Promise<ActiveCheckin | null> {
    const { rows } = await this.db.query<ActiveCheckin>(SQL.activeOf, [userId]);
    return rows[0] ?? null;
  }

  private async logAttempt(userId: string, cafeId: string | null, success: boolean, reason: string | null) {
    await this.db.query(SQL.logAttempt, [userId, cafeId, success, reason]);
  }

  /** QR okutarak check-in. Konum bilgisi alınmaz; kanıt dönen QR token'dır. */
  async scan(userId: string, cafeId: string, qrToken: string) {
    if (!(await allow(this.kv, `rl:scan:${userId}`, 10, 600))) {
      throw new AppError('TOO_MANY_ATTEMPTS', 'Çok fazla deneme yaptın. Birkaç dakika sonra tekrar dene.', 429);
    }

    const { rows } = await this.db.query(SQL.cafeForScan, [cafeId]);
    const cafe = rows[0];
    if (!cafe || cafe.status !== 'active') {
      await this.logAttempt(userId, cafe?.id ?? null, false, 'cafe_unavailable');
      throw new AppError('QR_INVALID', 'Bu QR kod geçerli değil.', 400);
    }

    const verdict = verifyQrToken(cafe.qr_secret, cafe.id, qrToken, Date.now(), this.cfg.qrWindowSeconds);
    if (verdict !== 'ok') {
      await this.logAttempt(userId, cafe.id, false, `qr_${verdict}`);
      throw verdict === 'expired'
        ? new AppError('QR_EXPIRED', 'Bu QR kodun süresi dolmuş. Kafedeki güncel kodu okut.', 400)
        : new AppError('QR_INVALID', 'Bu QR kod geçerli değil.', 400);
    }

    if (!isOpenAt(cafe.opening_hours, new Date(), this.cfg.timezone)) {
      await this.logAttempt(userId, cafe.id, false, 'cafe_closed');
      throw new AppError('CAFE_CLOSED', 'Bu kafe şu an kapalı.', 409);
    }

    const other = await this.db.query(SQL.recentOtherCafes, [userId, cafe.id]);
    if (other.rows[0].n >= 2) {
      await this.logAttempt(userId, cafe.id, false, 'multi_cafe');
      throw new AppError('TOO_MANY_ATTEMPTS', 'Kısa sürede çok fazla farklı kafede check-in denedin.', 429);
    }

    try {
      const row = await this.db.tx(async (c) => {
        await c.query(SQL.closeExpiredOfUser, [userId]);
        const res = await c.query(SQL.insertCheckin, [userId, cafe.id, this.cfg.checkinHours]);
        await c.query(SQL.logAttempt, [userId, cafe.id, true, null]);
        return res.rows[0];
      });
      return {
        checkin: {
          id: row.id,
          cafe: { id: cafe.id, name: cafe.name },
          visible: false, // görünürlük her zaman kapalı başlar
          started_at: row.started_at,
          expires_at: row.expires_at,
          intents: [] as string[],
        },
      };
    } catch (err) {
      if (pgCode(err) === '23505') {
        await this.logAttempt(userId, cafe.id, false, 'already_checked_in');
        throw new AppError('ALREADY_CHECKED_IN', 'Zaten bir kafede check-in yaptın. Önce çıkış yapmalısın.', 409);
      }
      throw err;
    }
  }

  async current(userId: string) {
    const ck = await this.getActive(userId);
    if (!ck) return { checkin: null };
    const intents = await this.db.query(SQL.intentsOf, [ck.id]);
    return {
      checkin: {
        id: ck.id,
        cafe: { id: ck.cafe_id, name: ck.cafe_name },
        visible: ck.visible,
        started_at: ck.started_at,
        expires_at: ck.expires_at,
        intents: intents.rows.map((r) => r.slug as string),
      },
    };
  }

  async setIntents(userId: string, slugs: string[]) {
    const ck = await this.getActive(userId);
    if (!ck) throw noActiveCheckin();
    await this.db.tx(async (c) => {
      const known = await c.query(SQL.countKnownIntents, [slugs]);
      if (known.rows[0].n !== slugs.length) throw new AppError('UNKNOWN_INTENT', 'Geçersiz seçenek var.', 422);
      await c.query(SQL.clearIntents, [ck.id]);
      await c.query(SQL.insertIntents, [ck.id, slugs]);
    });
    return this.current(userId);
  }

  /** "Görünür ol" anahtarı. Kapatmak her zaman serbesttir; açmak için koşullar aranır. */
  async setVisibility(userId: string, visible: boolean) {
    const ck = await this.getActive(userId);
    if (!ck) throw noActiveCheckin();
    if (visible && this.cfg.requireApprovedPhoto) {
      const { rows } = await this.db.query(SQL.hasApprovedPhoto, [userId]);
      if (!rows[0].ok) {
        throw new AppError('PHOTO_REQUIRED', 'Görünür olmak için onaylanmış bir profil fotoğrafın olmalı.', 422);
      }
    }
    await this.db.query(SQL.setVisible, [ck.id, visible]);
    return this.current(userId);
  }

  /** Check-out. Kullanıcının açık "masama davet et" teklifleri aynı işlemde iptal edilir. */
  async end(userId: string): Promise<{ ok: true }> {
    const ck = await this.getActive(userId);
    if (ck) {
      await this.db.tx(async (c) => {
        await c.query(SQL.end, [ck.id]);
        await c.query(SQL.cancelInvitationsOfUser, [userId]);
      });
    }
    return { ok: true };
  }
}
