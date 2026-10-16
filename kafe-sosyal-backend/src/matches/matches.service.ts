import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../common/errors';
import { validateMessageBody } from '../common/message-rules';
import { buildStarters } from '../common/starters';
import { DbService } from '../db/db.service';
import { allow, KV, KvStore } from '../kv/kv.store';
import { MATCHES_SQL as SQL } from './matches.sql';

const notFound = () => new AppError('MATCH_NOT_FOUND', 'Eşleşme bulunamadı.', 404);
const PREVIEW_CHARS = 80;

@Injectable()
export class MatchesService {
  constructor(
    private readonly db: DbService,
    @Inject(KV) private readonly kv: KvStore,
  ) {}

  /**
   * Erişim kontrolü tek yerde: eşleşmenin tarafı olmayan, eşleşmesi bitmiş/engellenmiş veya
   * karşı tarafı pasif olan herkes aynı "bulunamadı" yanıtını alır (nedeni sızmaz).
   */
  private async load(userId: string, matchId: string) {
    const { rows } = await this.db.query(SQL.one, [matchId, userId]);
    if (!rows[0]) throw notFound();
    return rows[0];
  }

  /** Karşı tarafın profili. Kafede olup olmadığı veya görünürlüğü hiçbir yerde döndürülmez. */
  private other(r: any) {
    return { user_id: r.user_id, display_name: r.display_name, age: r.age, photo_verified: r.photo_verified, photo_key: r.photo_key };
  }

  async list(userId: string) {
    const { rows } = await this.db.query(SQL.list, [userId, 100]);
    return {
      matches: rows.map((r) => ({
        match_id: r.match_id,
        matched_at: r.matched_at,
        cafe_name: r.cafe_name,
        other: this.other(r),
        last_message: r.last_body
          ? { preview: [...String(r.last_body)].slice(0, PREVIEW_CHARS).join(''), at: r.last_at, from_me: r.last_from_me }
          : null,
        unread: r.unread,
      })),
    };
  }

  async detail(userId: string, matchId: string) {
    const m = await this.load(userId, matchId);
    const common = await this.db.query(SQL.sharedInterests, [m.user_id, userId]);

    // Niyetler (flört dahil) yalnızca iki taraf da aynısını seçtiyse görünür
    const [mine, theirs] = await Promise.all([
      this.db.query(SQL.checkinAtMatch, [userId, m.cafe_id, m.matched_at]),
      this.db.query(SQL.checkinAtMatch, [m.user_id, m.cafe_id, m.matched_at]),
    ]);
    const shared =
      mine.rows[0] && theirs.rows[0]
        ? (await this.db.query(SQL.sharedIntents, [mine.rows[0].id, theirs.rows[0].id])).rows
        : [];

    return {
      match_id: m.match_id,
      matched_at: m.matched_at,
      cafe_name: m.cafe_name,
      other: this.other(m),
      common_interests: common.rows,
      shared_intents: shared,
    };
  }

  async end(userId: string, matchId: string): Promise<{ ok: true }> {
    await this.load(userId, matchId);
    await this.db.query(SQL.endMatch, [matchId]);
    return { ok: true };
  }

  async starters(userId: string, matchId: string) {
    const m = await this.load(userId, matchId);
    const common = await this.db.query(SQL.sharedInterests, [m.user_id, userId]);
    return { starters: buildStarters(common.rows) };
  }

  async messages(userId: string, matchId: string, before: string | undefined, limit = 30) {
    await this.load(userId, matchId);
    const take = Math.min(Math.max(limit, 1), 50);
    const { rows } = await this.db.query(SQL.messages, [matchId, before ?? null, take + 1]);
    const page = rows.slice(0, take);
    return {
      messages: page.map((r) => this.shape(r, userId)),
      next_before: rows.length > take ? page[page.length - 1].id : null,
    };
  }

  private shape(r: any, userId: string) {
    const mine = r.sender_id === userId;
    return { id: r.id, mine, body: r.body, created_at: r.created_at, read_at: mine ? r.read_at : null };
  }

  async send(userId: string, matchId: string, rawBody: string) {
    if (!(await allow(this.kv, `rl:msg:${userId}`, 30, 60))) {
      throw new AppError('TOO_MANY_REQUESTS', 'Çok hızlı mesaj gönderiyorsun, biraz bekle.', 429);
    }
    await this.load(userId, matchId);
    const { body, contact } = validateMessageBody(rawBody);
    const { rows } = await this.db.query(SQL.insertMessage, [matchId, userId, body, contact !== null]);
    const message = { id: rows[0].id, mine: true, body, created_at: rows[0].created_at, read_at: null };
    return contact
      ? {
          message,
          warning: {
            code: 'CONTACT_INFO',
            message: 'Kişisel bilgi paylaşmadan önce karşındaki kişiyi tanıdığından emin ol.',
          },
        }
      : { message };
  }

  async markRead(userId: string, matchId: string): Promise<{ read: number }> {
    await this.load(userId, matchId);
    const res = await this.db.query(SQL.markRead, [matchId, userId]);
    return { read: res.rowCount ?? 0 };
  }
}
