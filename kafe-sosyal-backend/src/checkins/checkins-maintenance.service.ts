import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { CHECKINS_SQL as SQL } from './checkins.sql';

const TICK_MS = 60_000;
const RETENTION_EVERY_MS = 6 * 3600_000;

/**
 * Dakikada bir süresi dolan check-in'leri kapatır. Doğruluk bu işe bağlı değildir: tüm sorgular
 * `expires_at > now()` kontrolü yapar; bu iş yalnızca kayıtları düzenli tutar.
 * Altı saatte bir KVKK saklama süreleri uygulanır (deneme kayıtları 30 gün, beğeniler 30 gün,
 * check-in'lerde kullanıcı bağlantısı 90 gün sonra silinir). Her adım tekrar çalıştırılabilir.
 */
@Injectable()
export class CheckinsMaintenanceService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('CheckinsMaintenance');
  private timer?: NodeJS.Timeout;
  private lastRetention = 0;

  constructor(private readonly db: DbService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    try {
      await this.db.query(SQL.expireAll);
      await this.db.query(SQL.cancelStaleInvitations);
      await this.db.query(SQL.expirePendingInvitations);
      if (Date.now() - this.lastRetention > RETENTION_EVERY_MS) {
        await this.db.query(SQL.purgeAttempts);
        await this.db.query(SQL.purgeLikes);
        await this.db.query(SQL.anonymizeOldCheckins);
        this.lastRetention = Date.now();
      }
    } catch (err) {
      this.log.error(err instanceof Error ? err.message : String(err));
    }
  }
}
