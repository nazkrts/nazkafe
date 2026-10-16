import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppError } from '../common/errors';
import { ImageType, sanitizeImage } from '../common/image';
import { DbService } from '../db/db.service';
import { allow, KV, KvStore } from '../kv/kv.store';
import { PHOTO_KEY_RE, PHOTO_STORAGE, PhotoStorage } from './photo-storage';
import { PHOTOS_SQL as SQL } from './photos.sql';

export const MAX_PHOTOS = 6;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MIME: Record<ImageType, string> = { jpeg: 'image/jpeg', png: 'image/png' };
const EXT: Record<ImageType, string> = { jpeg: 'jpg', png: 'png' };

@Injectable()
export class PhotosService {
  constructor(
    private readonly db: DbService,
    @Inject(PHOTO_STORAGE) private readonly storage: PhotoStorage,
    @Inject(KV) private readonly kv: KvStore,
  ) {}

  async list(userId: string) {
    const { rows } = await this.db.query(SQL.list, [userId]);
    return { photos: rows };
  }

  /**
   * Yükleme: boyut ve tür doğrulanır (imzadan), EXIF/konum gibi üst veri silinir, dosya rastgele adla
   * saklanır ve `pending` olarak moderasyon kuyruğuna girer. Onaylanana kadar yalnızca sahibi görür.
   */
  async upload(userId: string, body: unknown, contentType: string | undefined) {
    if (!(await allow(this.kv, `rl:photo:${userId}`, 10, 86400))) {
      throw new AppError('TOO_MANY_REQUESTS', 'Bugün çok fazla fotoğraf yükledin.', 429);
    }
    const type = (contentType ?? '').split(';')[0].trim().toLowerCase();
    if (!Buffer.isBuffer(body) || body.length === 0 || (type !== 'image/jpeg' && type !== 'image/png')) {
      throw new AppError('UNSUPPORTED_MEDIA', 'Fotoğrafı image/jpeg veya image/png olarak gönder.', 415);
    }
    if (body.length > MAX_UPLOAD_BYTES) throw new AppError('PHOTO_TOO_LARGE', 'Fotoğraf en fazla 5 MB olabilir.', 413);

    const img = sanitizeImage(body);
    if (MIME[img.type] !== type) throw new AppError('INVALID_IMAGE', 'Dosya türü beyan edilenle uyuşmuyor.', 422);

    const key = `${randomUUID()}.${EXT[img.type]}`;
    await this.storage.put(key, img.data);
    try {
      const photo = await this.db.tx(async (c) => {
        await c.query(SQL.lockUser, [userId]);
        const cnt = (await c.query(SQL.activeCount, [userId])).rows[0];
        if (cnt.n >= MAX_PHOTOS) throw new AppError('PHOTO_LIMIT', `En fazla ${MAX_PHOTOS} fotoğraf yükleyebilirsin.`, 409);
        return (await c.query(SQL.insert, [userId, key, cnt.next_pos])).rows[0];
      });
      return { photo: { id: photo.id, position: photo.position, moderation: photo.moderation, created_at: photo.created_at } };
    } catch (err) {
      await this.storage.delete(key).catch(() => undefined);   // yetim dosya bırakma
      throw err;
    }
  }

  async remove(userId: string, photoId: string): Promise<void> {
    const res = await this.db.query(SQL.remove, [photoId, userId]);
    if (!res.rows[0]) throw new AppError('PHOTO_NOT_FOUND', 'Fotoğraf bulunamadı.', 404);
    await this.storage.delete(res.rows[0].storage_key);
  }

  /** Dosyayı yalnızca erişim kuralları izin veriyorsa verir; her ret aynı "bulunamadı" yanıtıdır. */
  async file(userId: string, key: string): Promise<{ data: Buffer; contentType: string }> {
    const notFound = () => new AppError('PHOTO_NOT_FOUND', 'Fotoğraf bulunamadı.', 404);
    if (!PHOTO_KEY_RE.test(key)) throw notFound();
    if (!(await this.db.query(SQL.access, [key, userId])).rows[0]) throw notFound();
    const data = await this.storage.get(key);
    if (!data) throw notFound();
    return { data, contentType: key.endsWith('.png') ? 'image/png' : 'image/jpeg' };
  }
}
