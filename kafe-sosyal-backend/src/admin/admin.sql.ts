export const ADMIN_SQL = {
  byEmail: `SELECT id, password_hash, role, status, display_name FROM admins WHERE email = $1::text`,
  byId: `SELECT id, role, status FROM admins WHERE id = $1::uuid`,
  touchLogin: `UPDATE admins SET last_login_at = now() WHERE id = $1::uuid`,

  // $1 = durum listesi, $2 = sayfa boyu, $3 = ofset. Telefon/e-posta hiçbir yerde seçilmez.
  queue: `SELECT r.id, r.context, r.reason, r.priority, r.status, r.created_at,
                 rep.id AS reporter_id, rep.display_name AS reporter_name,
                 rd.id AS reported_id, rd.display_name AS reported_name, rd.status AS reported_status,
                 (SELECT count(*)::int FROM reports x WHERE x.reported_id = r.reported_id AND x.id <> r.id) AS other_reports
          FROM reports r
          JOIN users rep ON rep.id = r.reporter_id
          JOIN users rd ON rd.id = r.reported_id
          WHERE r.status = ANY($1::text[])
          ORDER BY r.priority DESC, r.created_at ASC, r.id
          LIMIT $2::int OFFSET $3::int`,

  report: `SELECT r.id, r.context, r.reason, r.details, r.priority, r.status, r.created_at, r.resolved_at,
                  r.message_id, r.reporter_id, r.reported_id
           FROM reports r WHERE r.id = $1::uuid`,
  profile: `SELECT u.id, u.display_name, EXTRACT(YEAR FROM age(u.birth_date))::int AS age, u.bio, u.status,
                   u.photo_verified, u.created_at,
                   COALESCE((SELECT json_agg(json_build_object('storage_key', p.storage_key, 'moderation', p.moderation)
                                             ORDER BY p.position) FROM user_photos p WHERE p.user_id = u.id), '[]'::json) AS photos
            FROM users u WHERE u.id = $1::uuid`,
  // Kanıt mesajının ±30 dk çevresi (aynı sohbetten, en fazla 30 mesaj)
  evidence: `SELECT mg.id, mg.sender_id, mg.body, mg.created_at, (mg.id = $1::uuid) AS is_reported_message
             FROM messages mg
             WHERE mg.match_id = (SELECT match_id FROM messages WHERE id = $1::uuid)
               AND mg.created_at BETWEEN (SELECT created_at FROM messages WHERE id = $1::uuid) - interval '30 minutes'
                                     AND (SELECT created_at FROM messages WHERE id = $1::uuid) + interval '30 minutes'
             ORDER BY mg.created_at, mg.id LIMIT 30`,
  otherReports: `SELECT id, context, reason, status, created_at FROM reports
                 WHERE reported_id = $1::uuid AND id <> $2::uuid ORDER BY created_at DESC LIMIT 10`,
  priorActions: `SELECT action, note, created_at FROM moderation_actions
                 WHERE user_id = $1::uuid AND action <> 'view_evidence' ORDER BY created_at DESC LIMIT 10`,
  // Özel mesaj içeriğine erişim kaydı (KVKK denetim izi)
  logAction: `INSERT INTO moderation_actions (admin_id, user_id, report_id, action, note)
              VALUES ($1::uuid, $2::uuid, $3::uuid, $4::text, $5::text)`,

  // --- Karar ve hesap işlemleri ---
  // Yalnızca açık/incelemedeki şikâyet sonuçlandırılır (çift işlem yarışına karşı)
  resolveReport: `UPDATE reports SET status = $2::text, resolved_at = now()
                  WHERE id = $1::uuid AND status IN ('open','reviewing') RETURNING reported_id`,
  suspendUser: `UPDATE users SET status = 'suspended' WHERE id = $1::uuid AND status = 'active' RETURNING id`,
  banUser: `UPDATE users SET status = 'banned' WHERE id = $1::uuid AND status IN ('active','suspended') RETURNING id`,
  userStatus: `SELECT status FROM users WHERE id = $1::uuid`,
  restoreUser: `UPDATE users SET status = 'active' WHERE id = $1::uuid AND status = $2::text RETURNING id`,
  // Askıya alma/yasaklamada açık check-in kapanır ve kullanıcının davetleri iptal edilir
  endCheckins: `UPDATE checkins SET ended_at = now(), visible = false WHERE user_id = $1::uuid AND ended_at IS NULL`,
  cancelInvitations: `UPDATE invitations SET status = 'cancelled', responded_at = now()
                      WHERE (from_user_id = $1::uuid OR to_user_id = $1::uuid) AND status IN ('pending','later','accepted')`,

  // --- "Rahatsızım" kuyruğu ---
  alerts: `SELECT sa.id, sa.created_at, sa.notify_cafe, sa.handled_at, sa.invitation_id,
                  c.name AS cafe_name,
                  sa.user_id, u.display_name AS user_name,
                  sa.other_user_id, o.display_name AS other_name
           FROM safety_alerts sa
           JOIN cafes c ON c.id = sa.cafe_id
           JOIN users u ON u.id = sa.user_id
           LEFT JOIN users o ON o.id = sa.other_user_id
           WHERE ($1::boolean = false OR sa.handled_at IS NULL)
           ORDER BY (sa.handled_at IS NULL) DESC, sa.created_at DESC
           LIMIT $2::int`,
  handleAlert: `UPDATE safety_alerts SET handled_at = now() WHERE id = $1::uuid AND handled_at IS NULL RETURNING user_id`,

  // --- Fotoğraf moderasyonu ---
  photoQueue: `SELECT p.id, p.user_id, u.display_name, EXTRACT(YEAR FROM age(u.birth_date))::int AS age,
                      p.moderation, p.position, p.created_at
               FROM user_photos p JOIN users u ON u.id = p.user_id AND u.status = 'active'
               WHERE p.moderation = $1::text
               ORDER BY p.created_at, p.id LIMIT $2::int`,
  photoOne: `SELECT p.id, p.user_id, p.storage_key, p.moderation
             FROM user_photos p JOIN users u ON u.id = p.user_id AND u.status = 'active'
             WHERE p.id = $1::uuid`,
  // Yarışa karşı koşullu güncelleme: onay yalnızca bekleyenden; ret bekleyen ve onaylıdan (sonradan fark edilen uygunsuzluk)
  approvePhoto: `UPDATE user_photos SET moderation = 'approved'
                 WHERE id = $1::uuid AND moderation = 'pending' RETURNING user_id`,
  rejectPhoto: `UPDATE user_photos SET moderation = 'rejected'
                WHERE id = $1::uuid AND moderation IN ('pending','approved') RETURNING user_id, storage_key`,

  // --- Kafe onayı ---
  cafeQueue: `SELECT c.id, c.name, c.branch_name, c.address, c.city, c.district, c.status, c.created_at,
                     COALESCE((SELECT json_agg(a.email ORDER BY a.created_at) FROM cafe_accounts a
                               WHERE a.cafe_id = c.id AND a.role = 'owner'), '[]'::json) AS owner_emails
              FROM cafes c WHERE c.status = $1::text ORDER BY c.created_at LIMIT $2::int`,
  setCafeStatus: `UPDATE cafes SET status = $2::text WHERE id = $1::uuid AND status <> $2::text RETURNING name`,
  cafeExists: `SELECT status FROM cafes WHERE id = $1::uuid`,
  // Askıya alınan kafede açık check-in'ler ve davetler kapanır
  endCafeCheckins: `UPDATE checkins SET ended_at = now(), visible = false WHERE cafe_id = $1::uuid AND ended_at IS NULL`,
  cancelCafeInvitations: `UPDATE invitations SET status = 'cancelled', responded_at = now()
                          WHERE cafe_id = $1::uuid AND status IN ('pending','later','accepted')`,
};
