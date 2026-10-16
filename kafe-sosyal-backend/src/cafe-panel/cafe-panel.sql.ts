export const CAFE_PANEL_SQL = {
  accountByEmail: `SELECT a.id, a.cafe_id, a.password_hash, a.role, a.status, c.status AS cafe_status
                   FROM cafe_accounts a JOIN cafes c ON c.id = a.cafe_id WHERE a.email = $1::text`,
  accountById: `SELECT a.id, a.cafe_id, a.role, a.status, c.status AS cafe_status
                FROM cafe_accounts a JOIN cafes c ON c.id = a.cafe_id WHERE a.id = $1::uuid`,
  touchLogin: `UPDATE cafe_accounts SET last_login_at = now() WHERE id = $1::uuid`,

  cafe: `SELECT id, name, branch_name, description, address, city, district, lat, lng, opening_hours, status, qr_secret
         FROM cafes WHERE id = $1::uuid`,
  updateProfile: `UPDATE cafes SET name = $2, branch_name = $3, description = $4, address = $5, city = $6,
                                   district = $7, lat = $8, lng = $9, opening_hours = $10::jsonb
                  WHERE id = $1::uuid`,

  lockCafe: `SELECT pg_advisory_xact_lock(hashtextextended($1::text, 3))`,
  points: `SELECT id, label, is_active FROM cafe_meeting_points WHERE cafe_id = $1::uuid ORDER BY is_active DESC, label`,
  activePointCount: `SELECT count(*)::int AS n FROM cafe_meeting_points WHERE cafe_id = $1::uuid AND is_active`,
  dupPoint: `SELECT 1 FROM cafe_meeting_points
             WHERE cafe_id = $1::uuid AND is_active AND lower(label) = lower($2::text)
               AND ($3::uuid IS NULL OR id <> $3::uuid)`,
  insertPoint: `INSERT INTO cafe_meeting_points (cafe_id, label) VALUES ($1::uuid, $2::text) RETURNING id, label, is_active`,
  pointOf: `SELECT id, label, is_active FROM cafe_meeting_points WHERE id = $1::uuid AND cafe_id = $2::uuid`,
  updatePoint: `UPDATE cafe_meeting_points SET label = $3::text, is_active = $4::boolean
                WHERE id = $1::uuid AND cafe_id = $2::uuid RETURNING id, label, is_active`,

  // Kullanıcı kimliği hiçbir şekilde seçilmez: yalnızca zaman ve (varsa) buluşma noktası
  alerts: `SELECT sa.id, sa.created_at, sa.cafe_ack_at, mp.label AS meeting_point
           FROM safety_alerts sa
           LEFT JOIN invitations i ON i.id = sa.invitation_id
           LEFT JOIN cafe_meeting_points mp ON mp.id = i.meeting_point_id
           WHERE sa.cafe_id = $1::uuid AND sa.notify_cafe AND sa.created_at > now() - interval '24 hours'
           ORDER BY (sa.cafe_ack_at IS NULL) DESC, sa.created_at DESC
           LIMIT 50`,
  ackAlert: `UPDATE safety_alerts SET cafe_ack_at = now()
             WHERE id = $1::uuid AND cafe_id = $2::uuid AND notify_cafe AND cafe_ack_at IS NULL RETURNING id`,
};
