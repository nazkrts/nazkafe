import { Inject, Injectable } from '@nestjs/common';
import { CheckinsService } from '../checkins/checkins.service';
import { AppError } from '../common/errors';
import { DbService } from '../db/db.service';
import { allow, KV, KvStore } from '../kv/kv.store';
import { INVITATIONS_SQL as SQL } from './invitations.sql';

const notFound = () => new AppError('INVITATION_NOT_FOUND', 'Davet bulunamadı veya süresi doldu.', 404);
const STATUS_OF_RESPONSE = { accept: 'accepted', later: 'later', decline: 'declined' } as const;

@Injectable()
export class InvitationsService {
  constructor(
    private readonly db: DbService,
    private readonly checkins: CheckinsService,
    @Inject(KV) private readonly kv: KvStore,
  ) {}

  async meetingPoints(userId: string) {
    const ck = await this.checkins.getActive(userId);
    if (!ck) throw new AppError('NO_ACTIVE_CHECKIN', 'Önce bir kafede check-in yapmalısın.', 409);
    const { rows } = await this.db.query(SQL.meetingPoints, [ck.cafe_id]);
    return { meeting_points: rows };
  }

  /**
   * "Masama davet et". Kendi check-in'in yoksa net hata döner. Karşı taraf kafede değilse veya eşleşme
   * geçersizse hepsi aynı genel yanıtı alır; karşı tarafın nerede olduğu sızmaz.
   */
  async create(userId: string, matchId: string, meetingPointId: string) {
    if (!(await allow(this.kv, `rl:inv:${userId}`, 10, 3600))) {
      throw new AppError('TOO_MANY_REQUESTS', 'Çok fazla davet gönderdin, biraz bekle.', 429);
    }
    const mine = await this.checkins.getActive(userId);
    if (!mine) throw new AppError('NO_ACTIVE_CHECKIN', 'Davet göndermek için kafede check-in yapmış olmalısın.', 409);

    const unavailable = () => new AppError('INVITATION_UNAVAILABLE', 'Şu an davet gönderilemiyor.', 409);
    const m = (await this.db.query(SQL.matchOf, [matchId, userId])).rows[0];
    if (!m) throw new AppError('MATCH_NOT_FOUND', 'Eşleşme bulunamadı.', 404);
    const point = (await this.db.query(SQL.meetingPoint, [meetingPointId, mine.cafe_id])).rows[0];
    if (!point) throw new AppError('MEETING_POINT_NOT_FOUND', 'Buluşma noktası bulunamadı.', 404);

    return this.db.tx(async (c) => {
      await c.query(SQL.lockMatch, [matchId]);
      if (!(await c.query(SQL.presentAt, [m.other_id, mine.cafe_id])).rows[0]) throw unavailable();
      if ((await c.query(SQL.openOfMatch, [matchId])).rows[0]) throw unavailable();
      if ((await c.query(SQL.cooldown, [matchId, userId])).rows[0]) {
        throw new AppError('INVITATION_COOLDOWN', 'Bu kişiye şu an yeniden davet gönderemezsin.', 409);
      }
      const r = (await c.query(SQL.insert, [matchId, userId, m.other_id, mine.cafe_id, point.id])).rows[0];
      return { invitation: { id: r.id, status: 'pending', meeting_point: point.label, created_at: r.created_at } };
    });
  }

  /** Gönderen "sonra" cevabını bekliyor görür; ret ve "sonra" ayrımı yalnızca alıcıda bilinir. */
  async list(userId: string) {
    const { rows } = await this.db.query(SQL.list, [userId]);
    return {
      invitations: rows.map((r) => ({
        id: r.id,
        match_id: r.match_id,
        direction: r.outgoing ? 'outgoing' : 'incoming',
        status: r.outgoing && r.status === 'later' ? 'pending' : r.status,
        meeting_point: r.meeting_point,
        cafe_name: r.cafe_name,
        created_at: r.created_at,
        other: { user_id: r.user_id, display_name: r.display_name, age: r.age, photo_verified: r.photo_verified, photo_key: r.photo_key },
      })),
    };
  }

  async respond(userId: string, invitationId: string, response: 'accept' | 'later' | 'decline') {
    const inv = (await this.db.query(SQL.oneValid, [invitationId, userId])).rows[0];
    if (!inv || inv.to_user_id !== userId) throw notFound();
    const status = STATUS_OF_RESPONSE[response];
    const res = await this.db.query(SQL.respond, [invitationId, status, userId]);
    if (!res.rows[0]) throw new AppError('INVITATION_CLOSED', 'Bu davet artık yanıtlanamaz.', 409);
    return { ok: true, status, ...(status === 'accepted' ? { meeting_point: inv.meeting_point } : {}) };
  }

  async cancel(userId: string, invitationId: string): Promise<{ ok: true }> {
    const inv = (await this.db.query(SQL.oneValid, [invitationId, userId])).rows[0];
    if (!inv) throw notFound();
    const res = await this.db.query(SQL.cancel, [invitationId, userId]);
    if (!res.rows[0]) throw new AppError('INVITATION_CLOSED', 'Bu davet artık iptal edilemez.', 409);
    return { ok: true };
  }
}
