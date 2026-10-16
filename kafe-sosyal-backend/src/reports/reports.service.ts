import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../common/errors';
import { REPORT_REASONS, ReportContext, ReportReason, reportPriority } from '../common/report-rules';
import { DbService } from '../db/db.service';
import { allow, KV, KvStore } from '../kv/kv.store';
import { REPORTS_SQL as SQL } from './reports.sql';

export interface ReportInput {
  reported_user_id: string;
  context: ReportContext;
  reason: ReportReason;
  message_id?: string;
  details?: string;
  block?: boolean;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly db: DbService,
    @Inject(KV) private readonly kv: KvStore,
  ) {}

  /**
   * Şikâyet. Yanıt her durumda `{ok:true}`: tekrar eden şikâyet de sessizce kabul edilir, böylece
   * hiçbir şey (hedefin var olduğu, daha önce şikâyet edildiği) sızmaz. Şikâyet edilen kişi bilgilendirilmez.
   */
  async create(userId: string, input: ReportInput): Promise<{ ok: true }> {
    if (!(await allow(this.kv, `rl:report:${userId}`, 10, 86400))) {
      throw new AppError('TOO_MANY_REQUESTS', 'Bugün çok fazla şikâyet gönderdin.', 429);
    }
    const target = input.reported_user_id;
    if (target === userId) throw new AppError('INVALID_REPORT', 'Kendini şikâyet edemezsin.', 422);
    if (!REPORT_REASONS.includes(input.reason)) throw new AppError('INVALID_REPORT', 'Geçersiz neden.', 422);
    const unavailable = () => new AppError('TARGET_UNAVAILABLE', 'Kullanıcı bulunamadı.', 404);

    if (!(await this.db.query(SQL.userExists, [target])).rows[0]) throw unavailable();
    if (!(await this.db.query(SQL.relation, [userId, target])).rows[0].ok) throw unavailable();

    let messageId: string | null = null;
    if (input.context === 'chat' && input.message_id) {
      if (!(await this.db.query(SQL.messageEvidence, [input.message_id, userId, target])).rows[0]) throw unavailable();
      messageId = input.message_id;
    }
    if (input.context === 'invitation') {
      if (!(await this.db.query(SQL.invitationEvidence, [userId, target])).rows[0]) throw unavailable();
    }
    const details = input.details?.trim() ? input.details.trim() : null;

    await this.db.tx(async (c) => {
      const dup = await c.query(SQL.openDuplicate, [userId, target, input.context]);
      if (!dup.rows[0]) {
        await c.query(SQL.insert, [userId, target, input.context, messageId, input.reason, details, reportPriority(input.reason)]);
      }
      if (input.block) {
        await c.query(SQL.insertBlock, [userId, target]);
        await c.query(SQL.blockMatch, [userId, target]);
        await c.query(SQL.cancelInvitations, [userId, target]);
      }
    });
    return { ok: true };
  }
}
