import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../common/errors';
import { cleanText, validateCoord, validateOpeningHours } from '../common/cafe-rules';
import { qrTokenFor, qrWindowOf } from '../common/qr';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { DbService } from '../db/db.service';
import { CafeUser } from './cafe-auth.guard';
import { UpdateCafeProfileDto } from './cafe-panel.dto';
import { CAFE_PANEL_SQL as SQL } from './cafe-panel.sql';

export const MAX_MEETING_POINTS = 10;
const requireOwner = (u: CafeUser) => {
  if (u.role !== 'owner') throw new AppError('FORBIDDEN', 'Bu işlem yalnızca kafe sahibine açık.', 403);
};

@Injectable()
export class CafePanelService {
  constructor(
    private readonly db: DbService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  private async cafe(cafeId: string) {
    const c = (await this.db.query(SQL.cafe, [cafeId])).rows[0];
    if (!c) throw new AppError('CAFE_NOT_FOUND', 'Kafe bulunamadı.', 404);
    return c;
  }

  private publicShape(c: any) {
    const { qr_secret: _secret, ...rest } = c;   // QR sırrı hiçbir yanıtta dönmez
    return rest;
  }

  async me(u: CafeUser) {
    return { account: { id: u.accountId, role: u.role }, cafe: this.publicShape(await this.cafe(u.cafeId)) };
  }

  async updateProfile(u: CafeUser, dto: UpdateCafeProfileDto) {
    requireOwner(u);
    const cur = await this.cafe(u.cafeId);
    const has = (k: keyof UpdateCafeProfileDto) => dto[k] !== undefined;
    const next = {
      name: has('name') ? cleanText(dto.name, 'Ad', 2, 60, true) : cur.name,
      branch: has('branch_name') ? cleanText(dto.branch_name, 'Şube adı', 1, 60, false) : cur.branch_name,
      description: has('description') ? cleanText(dto.description, 'Açıklama', 1, 500, false) : cur.description,
      address: has('address') ? cleanText(dto.address, 'Adres', 5, 200, true) : cur.address,
      city: has('city') ? cleanText(dto.city, 'Şehir', 2, 60, true) : cur.city,
      district: has('district') ? cleanText(dto.district, 'İlçe', 1, 60, false) : cur.district,
      lat: has('lat') ? validateCoord(dto.lat, 'lat') : cur.lat,
      lng: has('lng') ? validateCoord(dto.lng, 'lng') : cur.lng,
      hours: has('opening_hours') ? validateOpeningHours(dto.opening_hours) : cur.opening_hours,
    };
    if ((next.lat === null) !== (next.lng === null)) throw new AppError('INVALID_CAFE_DATA', 'lat ve lng birlikte verilmeli.', 422);
    await this.db.query(SQL.updateProfile, [
      u.cafeId, next.name, next.branch, next.description, next.address, next.city, next.district, next.lat, next.lng, JSON.stringify(next.hours),
    ]);
    return this.me(u);
  }

  /** Ekranda gösterilecek dönen QR. Kafe 'active' değilse (onay bekliyor/askıda) verilmez. */
  async qr(u: CafeUser) {
    const c = await this.cafe(u.cafeId);
    if (c.status !== 'active') throw new AppError('CAFE_NOT_ACTIVE', 'Kafen henüz onaylanmadı.', 409);
    const w = this.cfg.qrWindowSeconds;
    const now = Date.now();
    const window = qrWindowOf(now, w);
    const token = qrTokenFor(c.qr_secret, c.id, window);
    return {
      cafe_id: c.id,
      token,
      link: `kafeapp://checkin?c=${c.id}&t=${token}`,
      window_seconds: w,
      expires_in: (window + 1) * w - Math.floor(now / 1000),   // bu süre sonunda yeni token alınmalı
    };
  }

  async points(u: CafeUser) {
    return { meeting_points: (await this.db.query(SQL.points, [u.cafeId])).rows };
  }

  async addPoint(u: CafeUser, labelRaw: string) {
    requireOwner(u);
    const label = cleanText(labelRaw, 'Ad', 2, 40, true)!;
    return this.db.tx(async (c) => {
      await c.query(SQL.lockCafe, [u.cafeId]);
      if ((await c.query(SQL.activePointCount, [u.cafeId])).rows[0].n >= MAX_MEETING_POINTS) {
        throw new AppError('POINT_LIMIT', `En fazla ${MAX_MEETING_POINTS} aktif buluşma noktası olabilir.`, 409);
      }
      if ((await c.query(SQL.dupPoint, [u.cafeId, label, null])).rows[0]) {
        throw new AppError('POINT_EXISTS', 'Bu adda bir buluşma noktası zaten var.', 409);
      }
      return { meeting_point: (await c.query(SQL.insertPoint, [u.cafeId, label])).rows[0] };
    });
  }

  async updatePoint(u: CafeUser, id: string, dto: { label?: string; is_active?: boolean }) {
    requireOwner(u);
    return this.db.tx(async (c) => {
      await c.query(SQL.lockCafe, [u.cafeId]);
      const cur = (await c.query(SQL.pointOf, [id, u.cafeId])).rows[0];
      if (!cur) throw new AppError('POINT_NOT_FOUND', 'Buluşma noktası bulunamadı.', 404);
      const label = dto.label !== undefined ? cleanText(dto.label, 'Ad', 2, 40, true)! : cur.label;
      const active = dto.is_active ?? cur.is_active;
      if (active) {   // etkin kalacak/olacaksa tekrar ve sınır kontrolü
        if ((await c.query(SQL.dupPoint, [u.cafeId, label, id])).rows[0]) {
          throw new AppError('POINT_EXISTS', 'Bu adda bir buluşma noktası zaten var.', 409);
        }
        if (!cur.is_active && (await c.query(SQL.activePointCount, [u.cafeId])).rows[0].n >= MAX_MEETING_POINTS) {
          throw new AppError('POINT_LIMIT', `En fazla ${MAX_MEETING_POINTS} aktif buluşma noktası olabilir.`, 409);
        }
      }
      return { meeting_point: (await c.query(SQL.updatePoint, [id, u.cafeId, label, active])).rows[0] };
    });
  }

  /** "Rahatsızım" uyarıları (yalnızca kullanıcı kafeye haber verilmesini istediyse). Kimlik içermez. */
  async alerts(u: CafeUser) {
    return { alerts: (await this.db.query(SQL.alerts, [u.cafeId])).rows };
  }

  async ackAlert(u: CafeUser, id: string): Promise<{ ok: true }> {
    const r = await this.db.query(SQL.ackAlert, [id, u.cafeId]);
    if (!r.rows[0]) throw new AppError('ALERT_NOT_FOUND', 'Uyarı bulunamadı veya zaten onaylandı.', 404);
    return { ok: true };
  }
}
