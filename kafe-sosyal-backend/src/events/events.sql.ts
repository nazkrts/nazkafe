export const EVENTS_SQL = {
  lockEvent: `SELECT pg_advisory_xact_lock(hashtextextended($1::text, 4))`,
  forJoin: `SELECT e.id, e.status, e.capacity, e.ends_at, c.status AS cafe_status
            FROM events e JOIN cafes c ON c.id = e.cafe_id WHERE e.id = $1::uuid`,
  attendeeCount: `SELECT count(*)::int AS n FROM event_attendees WHERE event_id = $1::uuid`,
  join: `INSERT INTO event_attendees (event_id, user_id) VALUES ($1::uuid, $2::uuid) ON CONFLICT DO NOTHING`,
  leave: `DELETE FROM event_attendees WHERE event_id = $1::uuid AND user_id = $2::uuid`,
  mine: `SELECT e.id, e.title, e.category, e.starts_at, e.ends_at, c.id AS cafe_id, c.name AS cafe_name
         FROM event_attendees a
         JOIN events e ON e.id = a.event_id AND e.status = 'scheduled' AND e.ends_at > now()
         JOIN cafes c ON c.id = e.cafe_id AND c.status = 'active'
         WHERE a.user_id = $1::uuid ORDER BY e.starts_at LIMIT 50`,
};
