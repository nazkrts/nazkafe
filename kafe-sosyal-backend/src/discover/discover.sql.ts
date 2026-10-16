// Parametreler: $1 = ben, $2 = kafe, $3 = benim check-in'im, $4 = onaylı fotoğraf şartı, $5 = üst sınır
export const DISCOVER_SQL = {
  /**
   * Aynı kafede, şu an görünür olan kişiler. Hariç tutulanlar: ben, iki yönlü engelliler,
   * daha önce beğendiğim/geçtiğim kişiler (bu check-in boyunca) ve zaten eşleştiklerim.
   * Masa, mesafe ve niyet bilgisi hiçbir zaman seçilmez.
   */
  list: `SELECT u.id AS user_id, u.display_name,
                EXTRACT(YEAR FROM age(u.birth_date))::int AS age,
                u.photo_verified,
                p.storage_key AS photo_key,
                COALESCE(common.items, '[]'::json) AS common_interests
         FROM checkins c2
         JOIN users u ON u.id = c2.user_id AND u.status = 'active'
         LEFT JOIN LATERAL (
           SELECT storage_key FROM user_photos
           WHERE user_id = u.id AND moderation = 'approved'
           ORDER BY position, created_at LIMIT 1
         ) p ON TRUE
         LEFT JOIN LATERAL (
           SELECT count(*)::int AS n,
                  json_agg(json_build_object('slug', i.slug, 'label', i.label, 'emoji', i.emoji)
                           ORDER BY i.label) AS items
           FROM user_interests theirs
           JOIN user_interests mine ON mine.interest_id = theirs.interest_id AND mine.user_id = $1::uuid
           JOIN interests i ON i.id = theirs.interest_id
           WHERE theirs.user_id = u.id
         ) common ON TRUE
         WHERE c2.cafe_id = $2::uuid
           AND c2.ended_at IS NULL AND c2.expires_at > now() AND c2.visible
           AND c2.user_id <> $1::uuid
           AND ($4::boolean = false OR p.storage_key IS NOT NULL)
           AND NOT EXISTS (SELECT 1 FROM blocks b
                           WHERE (b.blocker_id = $1::uuid AND b.blocked_id = u.id)
                              OR (b.blocker_id = u.id AND b.blocked_id = $1::uuid))
           AND NOT EXISTS (SELECT 1 FROM likes l
                           WHERE l.from_user_id = $1::uuid AND l.to_user_id = u.id
                             AND l.checkin_id = $3::uuid)
           AND NOT EXISTS (SELECT 1 FROM matches m
                           WHERE m.user_a_id = LEAST(u.id, $1::uuid)
                             AND m.user_b_id = GREATEST(u.id, $1::uuid))
         ORDER BY common.n DESC NULLS LAST, random()
         LIMIT $5::int`,

  /** Aynı iki kişi aynı anda birbirini beğenirken eşleşme kaçmasın: çift başına kilit. */
  lockPair: `SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))`,

  // $1 = hedef, $2 = kafe, $3 = ben
  targetPresent: `SELECT 1
                  FROM checkins ci JOIN users u ON u.id = ci.user_id AND u.status = 'active'
                  WHERE ci.user_id = $1::uuid AND ci.cafe_id = $2::uuid
                    AND ci.ended_at IS NULL AND ci.expires_at > now() AND ci.visible
                    AND NOT EXISTS (SELECT 1 FROM blocks b
                                    WHERE (b.blocker_id = $1::uuid AND b.blocked_id = $3::uuid)
                                       OR (b.blocker_id = $3::uuid AND b.blocked_id = $1::uuid))`,
  insertAction: `INSERT INTO likes (from_user_id, to_user_id, cafe_id, checkin_id, kind)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (from_user_id, to_user_id, checkin_id) DO NOTHING
                 RETURNING id`,
  likeCount: `SELECT count(*)::int AS n FROM likes
              WHERE from_user_id = $1 AND checkin_id = $2 AND kind = 'like'`,
  // $1 = hedef, $2 = ben, $3 = kafe: hedefin beni beğenisi hâlâ geçerli bir check-in'e bağlı mı?
  reciprocal: `SELECT 1
               FROM likes l JOIN checkins c ON c.id = l.checkin_id
               WHERE l.from_user_id = $1::uuid AND l.to_user_id = $2::uuid AND l.kind = 'like'
                 AND l.cafe_id = $3::uuid AND c.ended_at IS NULL AND c.expires_at > now()`,
  insertMatch: `INSERT INTO matches (user_a_id, user_b_id, cafe_id)
                VALUES (LEAST($1::uuid, $2::uuid), GREATEST($1::uuid, $2::uuid), $3::uuid)
                ON CONFLICT (user_a_id, user_b_id) DO NOTHING
                RETURNING id`,
  existingMatch: `SELECT id, status FROM matches
                  WHERE user_a_id = LEAST($1::uuid, $2::uuid) AND user_b_id = GREATEST($1::uuid, $2::uuid)`,
  userActive: `SELECT 1 FROM users WHERE id = $1 AND status = 'active'`,
};
