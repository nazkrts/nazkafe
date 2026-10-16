export const ME_SQL = {
  profile: `SELECT id, display_name, bio, photo_verified,
                   EXTRACT(YEAR FROM age(birth_date))::int AS age
            FROM users WHERE id = $1`,
  interestsOf: `SELECT i.id, i.slug, i.label, i.emoji
                FROM user_interests ui JOIN interests i ON i.id = ui.interest_id
                WHERE ui.user_id = $1 ORDER BY i.label`,
  photosOf: `SELECT id, storage_key, position, moderation
             FROM user_photos WHERE user_id = $1 ORDER BY position, created_at`,
  updateProfile: `UPDATE users
                  SET display_name = COALESCE($2::text, display_name),
                      bio = CASE WHEN $3::boolean THEN $4::text ELSE bio END
                  WHERE id = $1`,
  allInterests: `SELECT id, slug, label, emoji FROM interests ORDER BY label`,
  countKnownInterests: `SELECT count(*)::int AS n FROM interests WHERE id = ANY($1::int[])`,
  clearInterests: `DELETE FROM user_interests WHERE user_id = $1`,
  insertInterests: `INSERT INTO user_interests (user_id, interest_id)
                    SELECT $1::uuid, unnest($2::int[])`,
  latestConsents: `SELECT DISTINCT ON (type) type, version, granted, created_at
                   FROM consents WHERE user_id = $1 ORDER BY type, created_at DESC`,
  insertConsent: `INSERT INTO consents (user_id, type, version, granted) VALUES ($1, $2, $3, $4)`,

  // Hesap silme (KVKK): tek işlemde çalışır
  endCheckins: `UPDATE checkins SET ended_at = now(), visible = false WHERE user_id = $1 AND ended_at IS NULL`,
  deleteLikes: `DELETE FROM likes WHERE from_user_id = $1 OR to_user_id = $1`,
  deleteBlocks: `DELETE FROM blocks WHERE blocker_id = $1 OR blocked_id = $1`,
  // Açık şikâyete konu olan mesajlar inceleme bitene kadar saklanır
  deleteMessages: `DELETE FROM messages m
                   USING matches ma
                   WHERE m.match_id = ma.id
                     AND (ma.user_a_id = $1 OR ma.user_b_id = $1)
                     AND NOT EXISTS (SELECT 1 FROM reports r
                                     WHERE r.message_id = m.id AND r.status IN ('open','reviewing'))`,
  deleteEventAttendance: `DELETE FROM event_attendees WHERE user_id = $1`,
  endMatches: `UPDATE matches SET status = 'ended'
               WHERE (user_a_id = $1 OR user_b_id = $1) AND status = 'active'`,
  // Satırlar silinir; dosyalar işlemden sonra depodan silinir
  deletePhotos: `DELETE FROM user_photos WHERE user_id = $1 RETURNING storage_key`,
  anonymizeUser: `UPDATE users
                  SET status = 'deleted', deleted_at = now(), display_name = 'Silinmiş kullanıcı',
                      bio = NULL, email = NULL, phone_hash = NULL, phone_enc = NULL,
                      birth_date = DATE '1900-01-01', photo_verified = false
                  WHERE id = $1`,
};
