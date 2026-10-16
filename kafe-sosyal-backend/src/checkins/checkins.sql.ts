export const CHECKINS_SQL = {
  cafeForScan: `SELECT id, name, status, qr_secret, opening_hours FROM cafes WHERE id = $1`,
  // Aynı kişi kısa sürede birden çok kafede QR okutuyorsa (fotoğraftan paylaşılan QR işareti)
  recentOtherCafes: `SELECT count(DISTINCT cafe_id)::int AS n
                     FROM checkin_attempts
                     WHERE user_id = $1 AND success AND cafe_id <> $2
                       AND created_at > now() - interval '10 minutes'`,
  logAttempt: `INSERT INTO checkin_attempts (user_id, cafe_id, success, reason) VALUES ($1, $2, $3, $4)`,
  closeExpiredOfUser: `UPDATE checkins SET ended_at = expires_at, visible = false
                       WHERE user_id = $1 AND ended_at IS NULL AND expires_at <= now()`,
  // started_at ve expires_at aynı deyimdeki now() değerinden gelir: veritabanındaki max_3h kısıtı sağlanır
  insertCheckin: `INSERT INTO checkins (user_id, cafe_id, visible, expires_at)
                  VALUES ($1, $2, false, now() + make_interval(hours => $3::int))
                  RETURNING id, started_at, expires_at`,
  activeOf: `SELECT ci.id, ci.cafe_id, ci.visible, ci.started_at, ci.expires_at, c.name AS cafe_name
             FROM checkins ci JOIN cafes c ON c.id = ci.cafe_id
             WHERE ci.user_id = $1 AND ci.ended_at IS NULL AND ci.expires_at > now()`,
  intentsOf: `SELECT it.slug
              FROM checkin_intents cin JOIN intents it ON it.id = cin.intent_id
              WHERE cin.checkin_id = $1 ORDER BY it.slug`,
  countKnownIntents: `SELECT count(*)::int AS n FROM intents WHERE slug = ANY($1::text[])`,
  clearIntents: `DELETE FROM checkin_intents WHERE checkin_id = $1`,
  insertIntents: `INSERT INTO checkin_intents (checkin_id, intent_id)
                  SELECT $1::uuid, id FROM intents WHERE slug = ANY($2::text[])`,
  setVisible: `UPDATE checkins SET visible = $2::boolean WHERE id = $1`,
  hasApprovedPhoto: `SELECT EXISTS (SELECT 1 FROM user_photos WHERE user_id = $1 AND moderation = 'approved') AS ok`,
  end: `UPDATE checkins SET ended_at = now(), visible = false WHERE id = $1 AND ended_at IS NULL`,

  // Check-out'ta kullanıcının tüm açık davetleri iptal edilir
  cancelInvitationsOfUser: `UPDATE invitations SET status = 'cancelled', responded_at = now()
                            WHERE (from_user_id = $1::uuid OR to_user_id = $1::uuid)
                              AND status IN ('pending','later','accepted')`,

  // Zamanlanmış bakım
  // Süresi dolan check-in'ler yüzünden geçersizleşen davetler iptal; 15 dakikayı aşan bekleyenler 'expired'
  cancelStaleInvitations: `UPDATE invitations i SET status = 'cancelled', responded_at = now()
                           WHERE i.status IN ('pending','later','accepted')
                             AND (NOT EXISTS (SELECT 1 FROM checkins ck WHERE ck.user_id = i.from_user_id AND ck.cafe_id = i.cafe_id
                                              AND ck.ended_at IS NULL AND ck.expires_at > now())
                               OR NOT EXISTS (SELECT 1 FROM checkins ck WHERE ck.user_id = i.to_user_id AND ck.cafe_id = i.cafe_id
                                              AND ck.ended_at IS NULL AND ck.expires_at > now()))`,
  expirePendingInvitations: `UPDATE invitations SET status = 'expired', responded_at = now()
                             WHERE status = 'pending' AND created_at < now() - interval '15 minutes'`,
  expireAll: `UPDATE checkins SET ended_at = expires_at, visible = false
              WHERE ended_at IS NULL AND expires_at <= now()`,
  purgeAttempts: `DELETE FROM checkin_attempts WHERE created_at < now() - interval '30 days'`,
  purgeLikes: `DELETE FROM likes WHERE created_at < now() - interval '30 days'`,
  anonymizeOldCheckins: `UPDATE checkins SET user_id = NULL
                         WHERE user_id IS NOT NULL AND ended_at IS NOT NULL
                           AND ended_at < now() - interval '90 days'`,
};
