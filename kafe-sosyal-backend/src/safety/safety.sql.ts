export const SAFETY_SQL = {
  // Karşı taraf yalnızca daha önce eşleşilmiş biri olabilir (keyfi kullanıcıyı işaretleme kapısı kapalı)
  matchBetween: `SELECT id FROM matches
                 WHERE user_a_id = LEAST($1::uuid, $2::uuid) AND user_b_id = GREATEST($1::uuid, $2::uuid)`,
  invitationOf: `SELECT id, from_user_id, to_user_id FROM invitations
                 WHERE id = $1::uuid AND (from_user_id = $2::uuid OR to_user_id = $2::uuid)`,
  insertAlert: `INSERT INTO safety_alerts (user_id, other_user_id, cafe_id, invitation_id, notify_cafe)
                VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::boolean) RETURNING id`,
  insertBlock: `INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1::uuid, $2::uuid) ON CONFLICT DO NOTHING`,
  blockMatch: `UPDATE matches SET status = 'blocked'
               WHERE user_a_id = LEAST($1::uuid, $2::uuid) AND user_b_id = GREATEST($1::uuid, $2::uuid)
                 AND status <> 'blocked'`,
  cancelInvitations: `UPDATE invitations SET status = 'cancelled', responded_at = now()
                      WHERE status IN ('pending','later','accepted')
                        AND ((from_user_id = $1::uuid AND to_user_id = $2::uuid)
                          OR (from_user_id = $2::uuid AND to_user_id = $1::uuid))`,
  // Yüksek öncelikli şikâyet (admin kuyruğunda en üstte)
  insertReport: `INSERT INTO reports (reporter_id, reported_id, context, reason, priority)
                 VALUES ($1::uuid, $2::uuid, $3::text, 'safety_alert', 3)`,
};
