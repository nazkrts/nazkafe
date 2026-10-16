export const CAFE_EVENTS_SQL = {
  lockEvent: `SELECT pg_advisory_xact_lock(hashtextextended($1::text, 4))`,
  lockCafe: `SELECT pg_advisory_xact_lock(hashtextextended($1::text, 5))`,
  // Katılımcı sayısı kafeye kendi etkinliği için açıktır (kimlik değil, yalnızca sayı)
  list: `SELECT e.id, e.title, e.description, e.category, e.starts_at, e.ends_at, e.capacity, e.status,
                (SELECT count(*)::int FROM event_attendees a WHERE a.event_id = e.id) AS attendee_count
         FROM events e
         WHERE e.cafe_id = $1::uuid AND e.ends_at > now() - interval '30 days'
         ORDER BY e.starts_at DESC LIMIT 50`,
  upcomingCount: `SELECT count(*)::int AS n FROM events WHERE cafe_id = $1::uuid AND status = 'scheduled' AND ends_at > now()`,
  insert: `INSERT INTO events (cafe_id, title, description, category, starts_at, ends_at, capacity)
           VALUES ($1::uuid, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7::int)
           RETURNING id, title, description, category, starts_at, ends_at, capacity, status`,
  one: `SELECT e.id, e.title, e.description, e.category, e.starts_at, e.ends_at, e.capacity, e.status,
               (SELECT count(*)::int FROM event_attendees a WHERE a.event_id = e.id) AS attendee_count
        FROM events e WHERE e.id = $1::uuid AND e.cafe_id = $2::uuid`,
  update: `UPDATE events SET title = $3, description = $4, category = $5, starts_at = $6::timestamptz,
                             ends_at = $7::timestamptz, capacity = $8::int
           WHERE id = $1::uuid AND cafe_id = $2::uuid
           RETURNING id, title, description, category, starts_at, ends_at, capacity, status`,
  cancel: `UPDATE events SET status = 'cancelled'
           WHERE id = $1::uuid AND cafe_id = $2::uuid AND status = 'scheduled' AND ends_at > now() RETURNING id`,

  // --- İstatistik: her kova k >= 5 ---
  total: `SELECT count(*)::int AS n FROM checkins
          WHERE cafe_id = $1::uuid AND started_at > now() - make_interval(days => $2::int)`,
  byHour: `SELECT EXTRACT(HOUR FROM started_at AT TIME ZONE $3::text)::int AS hour, count(*)::int AS n
           FROM checkins WHERE cafe_id = $1::uuid AND started_at > now() - make_interval(days => $2::int)
           GROUP BY 1 HAVING count(*) >= 5 ORDER BY 1`,
  byWeekday: `SELECT EXTRACT(DOW FROM started_at AT TIME ZONE $3::text)::int AS weekday, count(*)::int AS n
              FROM checkins WHERE cafe_id = $1::uuid AND started_at > now() - make_interval(days => $2::int)
              GROUP BY 1 HAVING count(*) >= 5 ORDER BY 1`,
  intents: `SELECT it.slug, it.label, count(*)::int AS n
            FROM checkin_intents ci
            JOIN checkins c ON c.id = ci.checkin_id
            JOIN intents it ON it.id = ci.intent_id
            WHERE c.cafe_id = $1::uuid AND c.started_at > now() - make_interval(days => $2::int)
            GROUP BY it.slug, it.label HAVING count(*) >= 5 ORDER BY n DESC, it.slug`,
  eventStats: `SELECT e.id, e.title, e.starts_at, e.status, count(a.user_id)::int AS attendees
               FROM events e LEFT JOIN event_attendees a ON a.event_id = e.id
               WHERE e.cafe_id = $1::uuid AND e.starts_at > now() - interval '90 days'
               GROUP BY e.id ORDER BY e.starts_at DESC LIMIT 20`,

  // --- Kafe kaydı ---
  insertCafe: `INSERT INTO cafes (name, branch_name, address, city, district, status, qr_secret)
               VALUES ($1, $2, $3, $4, $5, 'pending', $6) RETURNING id`,
  insertOwner: `INSERT INTO cafe_accounts (cafe_id, email, password_hash, role) VALUES ($1::uuid, $2, $3, 'owner')`,
};
