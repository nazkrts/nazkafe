export const REPORTS_SQL = {
  userExists: `SELECT 1 FROM users WHERE id = $1::uuid AND status <> 'deleted'`,
  // Şikâyet edilebilecek kişi: eşleşilmiş biri ya da şu an aynı kafede check-in'de olan biri
  relation: `SELECT (EXISTS (SELECT 1 FROM matches WHERE user_a_id = LEAST($1::uuid, $2::uuid) AND user_b_id = GREATEST($1::uuid, $2::uuid))
               OR EXISTS (SELECT 1 FROM checkins a JOIN checkins b ON b.cafe_id = a.cafe_id
                          WHERE a.user_id = $1::uuid AND b.user_id = $2::uuid
                            AND a.ended_at IS NULL AND a.expires_at > now()
                            AND b.ended_at IS NULL AND b.expires_at > now())) AS ok`,
  // Kanıt: mesaj gerçekten bu çiftin sohbetinde ve şikâyet edilen kişiden
  messageEvidence: `SELECT 1 FROM messages mg JOIN matches m ON m.id = mg.match_id
                    WHERE mg.id = $1::uuid AND mg.sender_id = $3::uuid
                      AND m.user_a_id = LEAST($2::uuid, $3::uuid) AND m.user_b_id = GREATEST($2::uuid, $3::uuid)`,
  invitationEvidence: `SELECT 1 FROM invitations
                       WHERE (from_user_id = $1::uuid AND to_user_id = $2::uuid)
                          OR (from_user_id = $2::uuid AND to_user_id = $1::uuid)`,
  // Aynı konuda açık şikâyet varsa yenisi açılmaz (yanıt aynı kalır)
  openDuplicate: `SELECT 1 FROM reports
                  WHERE reporter_id = $1::uuid AND reported_id = $2::uuid AND context = $3::text AND status IN ('open','reviewing')`,
  insert: `INSERT INTO reports (reporter_id, reported_id, context, message_id, reason, details, priority)
           VALUES ($1::uuid, $2::uuid, $3::text, $4::uuid, $5::text, $6::text, $7::smallint)`,
  insertBlock: `INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1::uuid, $2::uuid) ON CONFLICT DO NOTHING`,
  blockMatch: `UPDATE matches SET status = 'blocked'
               WHERE user_a_id = LEAST($1::uuid, $2::uuid) AND user_b_id = GREATEST($1::uuid, $2::uuid)
                 AND status <> 'blocked'`,
  cancelInvitations: `UPDATE invitations SET status = 'cancelled', responded_at = now()
                      WHERE status IN ('pending','later','accepted')
                        AND ((from_user_id = $1::uuid AND to_user_id = $2::uuid)
                          OR (from_user_id = $2::uuid AND to_user_id = $1::uuid))`,
};
