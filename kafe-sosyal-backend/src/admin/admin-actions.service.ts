import { Injectable } from '@nestjs/common';
import { TokensService } from '../auth/tokens.service';
import { AppError } from '../common/errors';
import { DbService } from '../db/db.service';
import { AdminUser } from './admin-auth.guard';
import { ADMIN_SQL as SQL } from './admin.sql';

export type ResolveAction = 'dismiss' | 'warn' | 'suspend' | 'ban';
const REPORT_STATUS: Record<ResolveAction, string> = { dismiss: 'dismissed', warn: 'actioned', suspend: 'actioned', ban: 'actioned' };

@Injectable()
export class AdminActionsService {
  constructor(
    private readonly db: DbService,
    private readonly tokens: TokensService,
  ) {}

  private requireNote(note: string | undefined): string {
    const n = note?.trim() ?? '';
    if (n.length < 3) throw new AppError('NOTE_REQUIRED', 'Bu işlem için bir gerekçe yazmalısın.', 422);
    return n;
  }

  /**
   * Şikâyeti sonuçlandırır. Hesap işlemleri ve denetim kaydı tek işlemde yapılır; oturumlar işlemden sonra
   * kapatılır. Yasaklama yalnızca `admin` rolündedir. Şikâyet edene ve edilene bildirim gitmez (bildirim altyapısı yok).
   */
  async resolve(admin: AdminUser, reportId: string, action: ResolveAction, noteRaw?: string) {
    if (action === 'ban' && admin.role !== 'admin') {
      throw new AppError('FORBIDDEN', 'Yasaklama yetkisi yalnızca yöneticilerdedir.', 403);
    }
    const note = action === 'dismiss' ? (noteRaw?.trim() || null) : this.requireNote(noteRaw);

    const targetId = await this.db.tx(async (c) => {
      const res = await c.query(SQL.resolveReport, [reportId, REPORT_STATUS[action]]);
      if (!res.rows[0]) {
        const exists = await c.query(SQL.report, [reportId]);
        throw exists.rows[0]
          ? new AppError('REPORT_CLOSED', 'Bu şikâyet zaten sonuçlandırılmış.', 409)
          : new AppError('REPORT_NOT_FOUND', 'Şikâyet bulunamadı.', 404);
      }
      const userId: string = res.rows[0].reported_id;

      if (action === 'suspend' || action === 'ban') {
        const upd = await c.query(action === 'suspend' ? SQL.suspendUser : SQL.banUser, [userId]);
        if (!upd.rows[0]) throw new AppError('USER_UNAVAILABLE', 'Hesabın durumu bu işleme uygun değil.', 409);
        await c.query(SQL.endCheckins, [userId]);
        await c.query(SQL.cancelInvitations, [userId]);
      }
      await c.query(SQL.logAction, [admin.id, userId, reportId, action, note]);
      return action === 'suspend' || action === 'ban' ? userId : null;
    });
    if (targetId) await this.tokens.revokeAll(targetId);   // oturumlar hemen kapanır
    return { ok: true, status: REPORT_STATUS[action] };
  }

  /** Askıdaki hesabı açar. Yasaklı hesabı yalnızca `admin` rolü açabilir. */
  async restore(admin: AdminUser, userId: string, noteRaw: string) {
    const note = this.requireNote(noteRaw);
    const cur = (await this.db.query(SQL.userStatus, [userId])).rows[0];
    if (!cur || (cur.status !== 'suspended' && cur.status !== 'banned')) {
      throw new AppError('USER_UNAVAILABLE', 'Hesap askıda veya yasaklı değil.', 409);
    }
    if (cur.status === 'banned' && admin.role !== 'admin') {
      throw new AppError('FORBIDDEN', 'Yasağı yalnızca yöneticiler kaldırabilir.', 403);
    }
    await this.db.tx(async (c) => {
      const upd = await c.query(SQL.restoreUser, [userId, cur.status]);
      if (!upd.rows[0]) throw new AppError('USER_UNAVAILABLE', 'Hesabın durumu değişti.', 409);
      await c.query(SQL.logAction, [admin.id, userId, null, 'restore', note]);
    });
    return { ok: true };
  }

  async alerts(onlyOpen = true, limit = 50) {
    const { rows } = await this.db.query(SQL.alerts, [onlyOpen, Math.min(limit, 100)]);
    return { alerts: rows };
  }

  async handleAlert(admin: AdminUser, alertId: string): Promise<{ ok: true }> {
    const upd = await this.db.query(SQL.handleAlert, [alertId]);
    if (!upd.rows[0]) throw new AppError('ALERT_NOT_FOUND', 'Uyarı bulunamadı veya zaten işlendi.', 404);
    await this.db.query(SQL.logAction, [admin.id, upd.rows[0].user_id, null, 'alert_handled', null]);
    return { ok: true };
  }
}
