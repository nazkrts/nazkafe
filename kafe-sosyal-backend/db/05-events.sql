-- Etkinlikler: tutarlılık kısıtları ve dizinler
ALTER TABLE events
    ADD CONSTRAINT events_time_order CHECK (ends_at > starts_at),
    ADD CONSTRAINT events_capacity   CHECK (capacity IS NULL OR capacity > 0),
    ADD CONSTRAINT events_category   CHECK (category IS NULL OR category IN ('quiz','tasting','boardgames','networking','music','other'));
CREATE INDEX events_cafe_time ON events(cafe_id, starts_at);
CREATE INDEX event_attendees_user ON event_attendees(user_id);
