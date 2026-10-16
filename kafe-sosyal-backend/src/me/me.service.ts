import { Inject, Injectable, Logger } from '@nestjs/common';
import { TokensService } from '../auth/tokens.service';
import { AppError } from '../common/errors';
import { validateBio, validateDisplayName } from '../common/profile-rules';
import { DbService } from '../db/db.service';
import { LEGAL_DOCUMENTS } from '../onboarding/legal';
import { PHOTO_STORAGE, PhotoStorage } from '../photos/photo-storage';
import { ConsentChangeDto, UpdateProfileDto } from './me.dto';
import { ME_SQL } from './me.sql';

@Injectable()
export class MeService {
  constructor(
    private readonly db: DbService,
    private readonly tokens: TokensService,
    @Inject(PHOTO_STORAGE) private readonly storage: PhotoStorage,
  ) {}

  private readonly log = new Logger('MeService');

  async getMe(userId: string) {
    const [profile, interests, photos] = await Promise.all([
      this.db.query(ME_SQL.profile, [userId]),
      this.db.query(ME_SQL.interestsOf, [userId]),
      this.db.query(ME_SQL.photosOf, [userId]),
    ]);
    const u = profile.rows[0];
    return {
      id: u.id,
      display_name: u.display_name,
      age: u.age,
      bio: u.bio,
      photo_verified: u.photo_verified,
      interests: interests.rows,
      photos: photos.rows,
    };
  }

  async updateMe(userId: string, dto: UpdateProfileDto) {
    const name = dto.display_name !== undefined ? validateDisplayName(dto.display_name) : null;
    const bioProvided = dto.bio !== undefined;
    const bio = bioProvided ? validateBio(dto.bio) : null;
    await this.db.query(ME_SQL.updateProfile, [userId, name, bioProvided, bio]);
    return this.getMe(userId);
  }

  async listInterests() {
    const { rows } = await this.db.query(ME_SQL.allInterests);
    return { interests: rows };
  }

  async setInterests(userId: string, ids: number[]) {
    await this.db.tx(async (c) => {
      const known = await c.query(ME_SQL.countKnownInterests, [ids]);
      if (known.rows[0].n !== ids.length) {
        throw new AppError('UNKNOWN_INTEREST', 'Geçersiz ilgi alanı seçildi.', 422);
      }
      await c.query(ME_SQL.clearInterests, [userId]);
      await c.query(ME_SQL.insertInterests, [userId, ids]);
    });
    return this.getMe(userId);
  }

  async listConsents(userId: string) {
    const { rows } = await this.db.query(ME_SQL.latestConsents, [userId]);
    return { consents: rows };
  }

  async changeConsent(userId: string, dto: ConsentChangeDto) {
    const doc = LEGAL_DOCUMENTS.find((d) => d.type === dto.type);
    if (!doc || doc.version !== dto.version) {
      throw new AppError('CONSENT_VERSION_MISMATCH', 'Metnin güncel sürümünü onaylamalısın.', 422);
    }
    if (doc.required && !dto.granted) {
      throw new AppError(
        'CONSENT_REQUIRED',
        'Bu rıza uygulamanın çalışması için zorunlu. Geri çekmek istersen hesabını silebilirsin.',
        422,
      );
    }
    await this.db.query(ME_SQL.insertConsent, [userId, dto.type, dto.version, dto.granted]);
    return this.listConsents(userId);
  }

  /**
   * Hesap silme: aktif check-in biter, beğeniler/engeller/mesajlar silinir, eşleşmeler kapanır,
   * fotoğraf satırları ve dosyaları silinir, kişisel alanlar temizlenir ve tüm oturumlar kapatılır.
   */
  async deleteMe(userId: string): Promise<void> {
    const keys = await this.db.tx(async (c) => {
      await c.query(ME_SQL.endCheckins, [userId]);
      await c.query(ME_SQL.deleteLikes, [userId]);
      await c.query(ME_SQL.deleteBlocks, [userId]);
      await c.query(ME_SQL.deleteMessages, [userId]);
      await c.query(ME_SQL.deleteEventAttendance, [userId]);
      await c.query(ME_SQL.endMatches, [userId]);
      await c.query(ME_SQL.clearInterests, [userId]);
      const photos = await c.query(ME_SQL.deletePhotos, [userId]);
      await c.query(ME_SQL.anonymizeUser, [userId]);
      return photos.rows.map((r: any) => r.storage_key as string);
    });
    await this.tokens.revokeAll(userId);
    // Dosyalar işlem tamamlandıktan sonra silinir; biri silinemezse hesap silme yine de başarılıdır
    for (const key of keys) {
      await this.storage.delete(key).catch((err) => this.log.error(`fotoğraf silinemedi (${key}): ${err?.message ?? err}`));
    }
  }
}
