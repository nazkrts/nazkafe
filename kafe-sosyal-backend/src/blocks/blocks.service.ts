import { Injectable } from '@nestjs/common';
import { AppError } from '../common/errors';
import { DbService } from '../db/db.service';
import { BLOCKS_SQL as SQL } from './blocks.sql';

@Injectable()
export class BlocksService {
  constructor(private readonly db: DbService) {}

  /**
   * Engelleme karşılıklı çalışır: keşif, beğeni ve eşleşme sorguları iki yönü de kontrol eder,
   * böylece iki taraf da birbirini görmez.
   */
  async block(userId: string, targetId: string): Promise<{ ok: true }> {
    if (userId === targetId) throw new AppError('CANNOT_BLOCK_SELF', 'Kendini engelleyemezsin.', 422);
    const exists = await this.db.query(SQL.userExists, [targetId]);
    if (!exists.rows[0]) throw new AppError('TARGET_UNAVAILABLE', 'Kullanıcı bulunamadı.', 404);
    await this.db.tx(async (c) => {
      await c.query(SQL.insertBlock, [userId, targetId]);
      await c.query(SQL.blockMatch, [userId, targetId]);
      await c.query(SQL.cancelInvitations, [userId, targetId]);
    });
    return { ok: true };
  }

  async unblock(userId: string, targetId: string): Promise<void> {
    await this.db.query(SQL.removeBlock, [userId, targetId]);
  }

  async listMine(userId: string) {
    const { rows } = await this.db.query(SQL.listMine, [userId]);
    return { blocks: rows };
  }
}
