import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppError } from '../common/errors';
import { DbService } from '../db/db.service';
import { PHOTO_KEY_RE, PHOTO_STORAGE, PhotoStorage } from '../photos/photo-storage';
import { AdminUser } from './admin-auth.guard';
import { ADMIN_SQL as SQL } from './admin.sql';

@Injectable()
export class AdminPhotosService {
  private readonly log = new Logger('AdminPhotos');

  constructor(
    private readonly db: DbService,
    @Inject(PHOTO_STORAGE) private readonly storage: PhotoStorage,
  ) {}

  /** Moderasyon kuyruğu: en eski bekleyen önce. Yalnızca ad ve yaş görünür; iletişim bilgisi yok. */
  async queue(status: 'pending' | 'approved' | 'rejected' = 'pending', limit = 20) {
    const { rows } = await this.db.query(SQL.photoQueue, [status, Math.min(limit, 50)]);
    return { photos: rows };
  }

  async file(photoId: string): Promise<{ data: Buffer; contentType: string }> {
    const notFound = () => new AppError('PHOTO_NOT_FOUND', 'Fotoğraf bulunamadı.', 404);
    const p = (await this.db.query(SQL.photoOne, [photoId])).rows[0];
    if (!p || !PHOTO_KEY_RE.test(p.storage_key)) throw notFound();
    const data = await this.storage.get(p.storage_key);
    if (!data) throw notFound();
    return { data, contentType: p.storage_key.endsWith('.png') ? 'image/png' : 'image/jpeg' };
  }

  /**
   * Onay/ret. Ret için gerekçe zorunludur, dosya depodan silinir (satır 'rejected' olarak kalır, kullanıcı
   * yeniden yükleyebilir). Karar ve denetim kaydı tek işlemde yazılır.
   */
  async review(admin: AdminUser, photoId: string, decision: 'approve' | 'reject', noteRaw?: string) {
    const note = noteRaw?.trim() ?? '';
    if (decision === 'reject' && note.length < 3) {
      throw new AppError('NOTE_REQUIRED', 'Ret için bir gerekçe yazmalısın.', 422);
    }
    const key: string | null = await this.db.tx(async (c) => {
      const res = await c.query(decision === 'approve' ? SQL.approvePhoto : SQL.rejectPhoto, [photoId]);
      if (!res.rows[0]) {
        const exists = await c.query(SQL.photoOne, [photoId]);
        throw exists.rows[0]
          ? new AppError('PHOTO_CLOSED', 'Bu fotoğraf için bu karar verilemez.', 409)
          : new AppError('PHOTO_NOT_FOUND', 'Fotoğraf bulunamadı.', 404);
      }
      await c.query(SQL.logAction, [admin.id, res.rows[0].user_id, null, decision === 'approve' ? 'photo_approve' : 'photo_reject', note || null]);
      return decision === 'reject' ? (res.rows[0].storage_key as string) : null;
    });
    if (key) await this.storage.delete(key).catch((err) => this.log.error(`fotoğraf silinemedi (${key}): ${err?.message ?? err}`));
    return { ok: true, moderation: decision === 'approve' ? 'approved' : 'rejected' };
  }
}
