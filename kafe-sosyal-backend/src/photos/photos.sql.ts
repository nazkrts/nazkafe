export const PHOTOS_SQL = {
  lockUser: `SELECT pg_advisory_xact_lock(hashtextextended($1::text, 2))`,
  list: `SELECT id, storage_key, position, moderation, created_at
         FROM user_photos WHERE user_id = $1::uuid ORDER BY position, created_at`,
  // Reddedilenler yer kaplamaz
  activeCount: `SELECT count(*)::int AS n, COALESCE(max(position) + 1, 0)::int AS next_pos
                FROM user_photos WHERE user_id = $1::uuid AND moderation <> 'rejected'`,
  insert: `INSERT INTO user_photos (user_id, storage_key, position)
           VALUES ($1::uuid, $2::text, $3::int) RETURNING id, position, moderation, created_at`,
  remove: `DELETE FROM user_photos WHERE id = $1::uuid AND user_id = $2::uuid RETURNING storage_key`,
  // Sahibi her durumda görür; başkası yalnızca onaylı ve aktif hesabın, engelsiz fotoğrafını
  access: `SELECT p.storage_key
           FROM user_photos p JOIN users u ON u.id = p.user_id AND u.status = 'active'
           WHERE p.storage_key = $1::text
             AND (p.user_id = $2::uuid
                  OR (p.moderation = 'approved'
                      AND NOT EXISTS (SELECT 1 FROM blocks b
                                      WHERE (b.blocker_id = $2::uuid AND b.blocked_id = p.user_id)
                                         OR (b.blocker_id = p.user_id AND b.blocked_id = $2::uuid))))`,
};
