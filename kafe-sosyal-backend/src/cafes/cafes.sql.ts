export const CAFES_SQL = {
  /** Sayılar yalnızca 'active' kullanıcıların süresi dolmamış check-in'lerinden gelir. */
  list: `SELECT c.id, c.name, c.branch_name, c.description, c.address, c.city, c.district,
                c.opening_hours,
                COALESCE(a.total, 0)   AS checkin_count,
                COALESCE(a.visible, 0) AS open_count
         FROM cafes c
         LEFT JOIN LATERAL (
           SELECT count(*)::int AS total, (count(*) FILTER (WHERE ci.visible))::int AS visible
           FROM checkins ci
           JOIN users u ON u.id = ci.user_id AND u.status = 'active'
           WHERE ci.cafe_id = c.id AND ci.ended_at IS NULL AND ci.expires_at > now()
         ) a ON TRUE
         WHERE c.status = 'active'
           AND ($1::text IS NULL OR c.city ILIKE $1::text)
           AND ($2::text IS NULL OR c.district ILIKE $2::text)
           AND ($3::text IS NULL OR c.name ILIKE '%' || $3::text || '%'
                                 OR c.branch_name ILIKE '%' || $3::text || '%')
         ORDER BY c.name
         LIMIT $4::int`,
  byId: `SELECT id, name, branch_name, description, address, city, district, opening_hours
         FROM cafes WHERE id = $1 AND status = 'active'`,
  meetingPointCount: `SELECT count(*)::int AS n FROM cafe_meeting_points WHERE cafe_id = $1 AND is_active`,
  // Katılımcı sayısı/listesi dönmez; yalnızca "dolu mu" ve kullanıcının kendi katılımı
  upcomingEvents: `SELECT e.id, e.title, e.description, e.category, e.starts_at, e.ends_at,
                          (e.capacity IS NOT NULL
                           AND (SELECT count(*) FROM event_attendees a WHERE a.event_id = e.id) >= e.capacity) AS is_full,
                          EXISTS (SELECT 1 FROM event_attendees a WHERE a.event_id = e.id AND a.user_id = $3::uuid) AS joined
                   FROM events e
                   WHERE e.cafe_id = $1 AND e.status = 'scheduled' AND e.ends_at > now()
                   ORDER BY e.starts_at
                   LIMIT $2::int`,
};
