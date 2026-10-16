// Bir davet yalnızca şu koşulların hepsi sürerken görünür/işlem görür: eşleşme aktif, iki kullanıcı aktif,
// aralarında engel yok, ikisi de davetin kafesinde check-in'de, bekleyen davet 15 dakikadan eski değil.
const VALID = `
  i.status IN ('pending','later','accepted')
  AND (i.status <> 'pending' OR i.created_at > now() - interval '15 minutes')
  AND m.status = 'active'
  AND ua.status = 'active' AND ub.status = 'active'
  AND NOT EXISTS (SELECT 1 FROM blocks b
                  WHERE (b.blocker_id = i.from_user_id AND b.blocked_id = i.to_user_id)
                     OR (b.blocker_id = i.to_user_id AND b.blocked_id = i.from_user_id))
  AND EXISTS (SELECT 1 FROM checkins ck WHERE ck.user_id = i.from_user_id AND ck.cafe_id = i.cafe_id
              AND ck.ended_at IS NULL AND ck.expires_at > now())
  AND EXISTS (SELECT 1 FROM checkins ck WHERE ck.user_id = i.to_user_id AND ck.cafe_id = i.cafe_id
              AND ck.ended_at IS NULL AND ck.expires_at > now())`;

const FROM = `FROM invitations i
  JOIN matches m ON m.id = i.match_id
  JOIN users ua ON ua.id = i.from_user_id
  JOIN users ub ON ub.id = i.to_user_id
  JOIN cafe_meeting_points mp ON mp.id = i.meeting_point_id
  JOIN cafes c ON c.id = i.cafe_id`;

export const INVITATIONS_SQL = {
  meetingPoints: `SELECT id, label FROM cafe_meeting_points WHERE cafe_id = $1 AND is_active ORDER BY label`,
  meetingPoint: `SELECT id, label FROM cafe_meeting_points WHERE id = $1 AND cafe_id = $2 AND is_active`,

  // $1 = eşleşme, $2 = ben; karşı tarafı da döndürür (aktif, engelsiz)
  matchOf: `SELECT m.id, o.id AS other_id
            FROM matches m
            JOIN users o ON o.id = CASE WHEN m.user_a_id = $2::uuid THEN m.user_b_id ELSE m.user_a_id END
                        AND o.status = 'active'
            WHERE m.id = $1::uuid AND (m.user_a_id = $2::uuid OR m.user_b_id = $2::uuid) AND m.status = 'active'
              AND NOT EXISTS (SELECT 1 FROM blocks b
                              WHERE (b.blocker_id = $2::uuid AND b.blocked_id = o.id)
                                 OR (b.blocker_id = o.id AND b.blocked_id = $2::uuid))`,
  presentAt: `SELECT 1 FROM checkins WHERE user_id = $1::uuid AND cafe_id = $2::uuid
              AND ended_at IS NULL AND expires_at > now()`,
  lockMatch: `SELECT pg_advisory_xact_lock(hashtextextended($1::text, 1))`,
  // Aynı eşleşmede açık (bekleyen/kabul edilmiş) davet varken yenisi gönderilmez
  openOfMatch: `SELECT 1 FROM invitations
                WHERE match_id = $1::uuid
                  AND ((status = 'pending' AND created_at > now() - interval '15 minutes')
                    OR (status IN ('later','accepted') AND created_at > now() - interval '3 hours'))`,
  // Reddedilen davet 3 saat, iptal edilen 5 dakika boyunca aynı kişiden tekrarlanamaz (taciz önleme)
  cooldown: `SELECT 1 FROM invitations
             WHERE match_id = $1::uuid AND from_user_id = $2::uuid
               AND ((status = 'declined' AND responded_at > now() - interval '3 hours')
                 OR (status = 'cancelled' AND responded_at > now() - interval '5 minutes'))`,
  insert: `INSERT INTO invitations (match_id, from_user_id, to_user_id, cafe_id, meeting_point_id)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)
           RETURNING id, created_at`,

  // $1 = ben
  list: `SELECT i.id, i.match_id, i.status, i.created_at, i.responded_at,
                (i.from_user_id = $1::uuid) AS outgoing,
                mp.label AS meeting_point, c.name AS cafe_name,
                o.id AS user_id, o.display_name,
                EXTRACT(YEAR FROM age(o.birth_date))::int AS age,
                o.photo_verified, p.storage_key AS photo_key
         ${FROM}
         JOIN users o ON o.id = CASE WHEN i.from_user_id = $1::uuid THEN i.to_user_id ELSE i.from_user_id END
         LEFT JOIN LATERAL (
           SELECT storage_key FROM user_photos
           WHERE user_id = o.id AND moderation = 'approved' ORDER BY position, created_at LIMIT 1
         ) p ON TRUE
         WHERE (i.from_user_id = $1::uuid OR i.to_user_id = $1::uuid) AND ${VALID}
         ORDER BY i.created_at DESC`,

  // $1 = davet, $2 = ben
  oneValid: `SELECT i.id, i.status, i.from_user_id, i.to_user_id, mp.label AS meeting_point
             ${FROM}
             WHERE i.id = $1::uuid AND (i.from_user_id = $2::uuid OR i.to_user_id = $2::uuid) AND ${VALID}`,
  // Yarış durumuna karşı: yalnızca alıcı, yalnızca bekleyen/"sonra" durumundan
  respond: `UPDATE invitations SET status = $2::text, responded_at = now()
            WHERE id = $1::uuid AND to_user_id = $3::uuid AND status IN ('pending','later')
            RETURNING id`,
  cancel: `UPDATE invitations SET status = 'cancelled', responded_at = now()
           WHERE id = $1::uuid
             AND (from_user_id = $2::uuid OR (to_user_id = $2::uuid AND status = 'accepted'))
             AND status IN ('pending','later','accepted')
           RETURNING id`,
};
