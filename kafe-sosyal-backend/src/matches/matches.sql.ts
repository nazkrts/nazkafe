// Eşleşmeye yalnızca iki taraftan biri erişir; eşleşme 'active', iki kullanıcı 'active' ve aralarında engel yoksa görünür.
export const MATCHES_SQL = {
  // $1 = ben, $2 = üst sınır
  list: `SELECT m.id AS match_id, m.created_at AS matched_at, c.name AS cafe_name,
                o.id AS user_id, o.display_name,
                EXTRACT(YEAR FROM age(o.birth_date))::int AS age,
                o.photo_verified, p.storage_key AS photo_key,
                lm.body AS last_body, lm.created_at AS last_at, (lm.sender_id = $1::uuid) AS last_from_me,
                COALESCE(un.n, 0) AS unread
         FROM matches m
         JOIN users o ON o.id = CASE WHEN m.user_a_id = $1::uuid THEN m.user_b_id ELSE m.user_a_id END
                     AND o.status = 'active'
         JOIN cafes c ON c.id = m.cafe_id
         LEFT JOIN LATERAL (
           SELECT storage_key FROM user_photos
           WHERE user_id = o.id AND moderation = 'approved' ORDER BY position, created_at LIMIT 1
         ) p ON TRUE
         LEFT JOIN LATERAL (
           SELECT body, created_at, sender_id FROM messages
           WHERE match_id = m.id ORDER BY created_at DESC, id DESC LIMIT 1
         ) lm ON TRUE
         LEFT JOIN LATERAL (
           SELECT count(*)::int AS n FROM messages
           WHERE match_id = m.id AND sender_id <> $1::uuid AND read_at IS NULL
         ) un ON TRUE
         WHERE (m.user_a_id = $1::uuid OR m.user_b_id = $1::uuid) AND m.status = 'active'
           AND NOT EXISTS (SELECT 1 FROM blocks b
                           WHERE (b.blocker_id = $1::uuid AND b.blocked_id = o.id)
                              OR (b.blocker_id = o.id AND b.blocked_id = $1::uuid))
         ORDER BY COALESCE(lm.created_at, m.created_at) DESC
         LIMIT $2::int`,

  // $1 = eşleşme, $2 = ben
  one: `SELECT m.id AS match_id, m.cafe_id, m.created_at AS matched_at, c.name AS cafe_name,
               o.id AS user_id, o.display_name,
               EXTRACT(YEAR FROM age(o.birth_date))::int AS age,
               o.photo_verified, p.storage_key AS photo_key
        FROM matches m
        JOIN users o ON o.id = CASE WHEN m.user_a_id = $2::uuid THEN m.user_b_id ELSE m.user_a_id END
                    AND o.status = 'active'
        JOIN cafes c ON c.id = m.cafe_id
        LEFT JOIN LATERAL (
          SELECT storage_key FROM user_photos
          WHERE user_id = o.id AND moderation = 'approved' ORDER BY position, created_at LIMIT 1
        ) p ON TRUE
        WHERE m.id = $1::uuid AND (m.user_a_id = $2::uuid OR m.user_b_id = $2::uuid) AND m.status = 'active'
          AND NOT EXISTS (SELECT 1 FROM blocks b
                          WHERE (b.blocker_id = $2::uuid AND b.blocked_id = o.id)
                             OR (b.blocker_id = o.id AND b.blocked_id = $2::uuid))`,

  // $1 = karşı taraf, $2 = ben
  sharedInterests: `SELECT i.slug, i.label, i.emoji
                    FROM user_interests theirs
                    JOIN user_interests mine ON mine.interest_id = theirs.interest_id AND mine.user_id = $2::uuid
                    JOIN interests i ON i.id = theirs.interest_id
                    WHERE theirs.user_id = $1::uuid
                    ORDER BY i.label`,

  // Eşleşme anındaki check-in'ler ve ortak niyetler: niyet yalnızca iki tarafta da seçildiyse görünür olur
  checkinAtMatch: `SELECT id FROM checkins
                   WHERE user_id = $1::uuid AND cafe_id = $2::uuid AND started_at <= $3::timestamptz
                   ORDER BY started_at DESC LIMIT 1`,
  sharedIntents: `SELECT it.slug, it.label
                  FROM intents it
                  WHERE it.id IN (SELECT intent_id FROM checkin_intents WHERE checkin_id = $1::uuid)
                    AND it.id IN (SELECT intent_id FROM checkin_intents WHERE checkin_id = $2::uuid)
                  ORDER BY it.label`,

  endMatch: `UPDATE matches SET status = 'ended' WHERE id = $1::uuid AND status = 'active'`,

  // $1 = eşleşme, $2 = bu kimlikten önceki mesajlar (veya NULL), $3 = üst sınır
  messages: `SELECT id, sender_id, body, created_at, read_at
             FROM messages
             WHERE match_id = $1::uuid
               AND ($2::uuid IS NULL
                    OR (created_at, id) < (SELECT created_at, id FROM messages WHERE id = $2::uuid AND match_id = $1::uuid))
             ORDER BY created_at DESC, id DESC
             LIMIT $3::int`,
  insertMessage: `INSERT INTO messages (match_id, sender_id, body, flagged)
                  VALUES ($1::uuid, $2::uuid, $3::text, $4::boolean)
                  RETURNING id, created_at`,
  markRead: `UPDATE messages SET read_at = now()
             WHERE match_id = $1::uuid AND sender_id <> $2::uuid AND read_at IS NULL`,
};
