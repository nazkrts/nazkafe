import { Injectable } from '@nestjs/common';
import { AppError } from '../common/errors';
import { DbService } from '../db/db.service';
import { ADMIN_SQL as SQL } from './admin.sql';

const STATUSES = { open: ['open', 'reviewing'], closed: ['actioned', 'dismissed'], all: ['open', 'reviewing', 'actioned', 'dismissed'] };

@Injectable()
export class AdminReportsService {
  constructor(private readonly db: DbService) {}

  async queue(status: 'open' | 'closed' | 'all' = 'open', limit = 20, offset = 0) {
    const { rows } = await this.db.query(SQL.queue, [STATUSES[status], Math.min(limit, 50), offset]);
    return { reports: rows };
  }

  /**
   * Şikâyet ayrıntısı. Telefon/e-posta gösterilmez. Kanıt mesajı varsa çevresindeki ±30 dk'lık sohbet
   * gösterilir ve bu erişim denetim izine yazılır (özel mesaj içeriği).
   */
  async detail(adminId: string, reportId: string) {
    const report = (await this.db.query(SQL.report, [reportId])).rows[0];
    if (!report) throw new AppError('REPORT_NOT_FOUND', 'Şikâyet bulunamadı.', 404);

    const [profile, others, prior] = await Promise.all([
      this.db.query(SQL.profile, [report.reported_id]),
      this.db.query(SQL.otherReports, [report.reported_id, reportId]),
      this.db.query(SQL.priorActions, [report.reported_id]),
    ]);

    let evidence: unknown = null;
    if (report.message_id) {
      const rows = (await this.db.query(SQL.evidence, [report.message_id])).rows;
      evidence = rows.map((m) => ({
        id: m.id,
        from: m.sender_id === report.reported_id ? 'reported' : 'reporter',
        body: m.body,
        created_at: m.created_at,
        is_reported_message: m.is_reported_message,
      }));
      await this.db.query(SQL.logAction, [adminId, report.reported_id, reportId, 'view_evidence', null]);
    }

    return {
      report: {
        id: report.id, context: report.context, reason: report.reason, details: report.details,
        priority: report.priority, status: report.status, created_at: report.created_at, resolved_at: report.resolved_at,
      },
      reported: profile.rows[0] ?? null,
      evidence,
      other_reports: others.rows,
      prior_actions: prior.rows,
    };
  }
}
