-- Kafe Sosyal Keşif Uygulaması: PostgreSQL veri modeli (MVP)
-- Not: Redis'te tutulacak anlık veriler en altta açıklanmıştır.


-- =========================================================
-- KULLANICILAR
-- =========================================================
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_hash      TEXT UNIQUE,               -- telefon açık tutulmaz, hash + ayrı şifreli alan
    phone_enc       BYTEA,                     -- şifreli telefon (OTP/destek için)
    email           TEXT UNIQUE,
    display_name    TEXT NOT NULL,             -- yalnızca ad
    birth_date      DATE NOT NULL,
    bio             TEXT,
    photo_verified  BOOLEAN NOT NULL DEFAULT FALSE,
    status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','suspended','banned','deleted')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    CONSTRAINT age_18_plus CHECK (birth_date <= (CURRENT_DATE - INTERVAL '18 years')),
    -- Silinen hesapta iletişim alanları temizlenir (KVKK), bu yüzden 'deleted' muaf
    CONSTRAINT contact_present CHECK (status = 'deleted' OR phone_hash IS NOT NULL OR email IS NOT NULL)
);

CREATE TABLE user_photos (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    storage_key   TEXT NOT NULL,
    position      SMALLINT NOT NULL DEFAULT 0,
    moderation    TEXT NOT NULL DEFAULT 'pending'
                  CHECK (moderation IN ('pending','approved','rejected')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE interests (
    id      SERIAL PRIMARY KEY,
    slug    TEXT UNIQUE NOT NULL,
    label   TEXT NOT NULL,
    emoji   TEXT
);

CREATE TABLE user_interests (
    user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
    interest_id  INT  REFERENCES interests(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, interest_id)
);

-- KVKK: her rıza ayrı, sürümlü ve kanıtlanabilir kayıt
CREATE TABLE consents (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type          TEXT NOT NULL,               -- 'privacy_notice','explicit_consent','community_rules','marketing'
    version       TEXT NOT NULL,
    granted       BOOLEAN NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================================
-- KAFELER
-- =========================================================
CREATE TABLE cafes (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL,
    branch_name   TEXT,
    description   TEXT,
    address       TEXT NOT NULL,
    city          TEXT NOT NULL,
    district      TEXT,
    lat           DOUBLE PRECISION,            -- yalnızca kafe konumu (kullanıcı konumu saklanmaz)
    lng           DOUBLE PRECISION,
    opening_hours JSONB NOT NULL DEFAULT '{}',
    status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','active','suspended')),
    qr_secret     BYTEA NOT NULL,              -- dönen QR token üretimi için (HMAC anahtarı)
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cafe_accounts (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cafe_id       UUID NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner','staff')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cafe_meeting_points (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cafe_id   UUID NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
    label     TEXT NOT NULL,                   -- "Kasanın yanı"
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- =========================================================
-- CHECK-IN
-- =========================================================
CREATE TABLE intents (
    id     SERIAL PRIMARY KEY,
    slug   TEXT UNIQUE NOT NULL,               -- coffee, meet, networking, games, study, dating, friends
    label  TEXT NOT NULL
);

CREATE TABLE checkins (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID REFERENCES users(id) ON DELETE CASCADE,  -- 90 gün sonra NULL'lanır (anonimleştirme)
    cafe_id       UUID NOT NULL REFERENCES cafes(id),
    visible       BOOLEAN NOT NULL DEFAULT FALSE,   -- "Görünür ol" (varsayılan kapalı)
    started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at    TIMESTAMPTZ NOT NULL,             -- en fazla started_at + 3 saat
    ended_at      TIMESTAMPTZ,
    CONSTRAINT max_3h CHECK (expires_at <= started_at + INTERVAL '3 hours')
);
-- Bir kullanıcının aynı anda yalnızca bir aktif check-in'i olabilir
CREATE UNIQUE INDEX one_active_checkin_per_user
    ON checkins(user_id) WHERE ended_at IS NULL;
CREATE INDEX checkins_cafe_active ON checkins(cafe_id) WHERE ended_at IS NULL;

CREATE TABLE checkin_intents (
    checkin_id  UUID REFERENCES checkins(id) ON DELETE CASCADE,
    intent_id   INT  REFERENCES intents(id),
    PRIMARY KEY (checkin_id, intent_id)
);

-- Şüpheli check-in tespiti için (QR denemeleri)
CREATE TABLE checkin_attempts (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    cafe_id     UUID REFERENCES cafes(id),
    success     BOOLEAN NOT NULL,
    reason      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================================
-- BEĞENİ, EŞLEŞME, MESAJ
-- =========================================================
CREATE TABLE likes (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cafe_id       UUID NOT NULL REFERENCES cafes(id),
    checkin_id    UUID NOT NULL REFERENCES checkins(id) ON DELETE CASCADE,
    kind          TEXT NOT NULL CHECK (kind IN ('like','pass')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (from_user_id, to_user_id, checkin_id),
    CHECK (from_user_id <> to_user_id)
);
-- Karşı taraf, eşleşme olmadan like bildirimi/bilgisi ALMAZ.

CREATE TABLE matches (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_a_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cafe_id       UUID NOT NULL REFERENCES cafes(id),
    status        TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','ended','blocked')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (user_a_id < user_b_id),             -- çift yönlü tekrarları engeller
    UNIQUE (user_a_id, user_b_id)
);

CREATE TABLE messages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id    UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    sender_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body        TEXT NOT NULL,
    flagged     BOOLEAN NOT NULL DEFAULT FALSE,  -- iletişim bilgisi / küfür filtresi
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    read_at     TIMESTAMPTZ
);
CREATE INDEX messages_match_time ON messages(match_id, created_at DESC);

-- =========================================================
-- MASAMA DAVET ET (teklif)
-- =========================================================
CREATE TABLE invitations (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id          UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    from_user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cafe_id           UUID NOT NULL REFERENCES cafes(id),
    meeting_point_id  UUID NOT NULL REFERENCES cafe_meeting_points(id),
    status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','accepted','later','declined','cancelled','expired')),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    responded_at      TIMESTAMPTZ
);
-- Uygulama kuralı: iki kullanıcı da aktif check-in'deyken geçerli,
-- biri check-out olunca status = 'cancelled'.

CREATE TABLE safety_alerts (                  -- "Rahatsızım" butonu
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    other_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
    cafe_id        UUID NOT NULL REFERENCES cafes(id),
    invitation_id  UUID REFERENCES invitations(id) ON DELETE SET NULL,
    notify_cafe    BOOLEAN NOT NULL DEFAULT FALSE,   -- kullanıcı onayıyla
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    handled_at     TIMESTAMPTZ
);

-- =========================================================
-- ENGELLEME VE ŞİKÂYET
-- =========================================================
CREATE TABLE blocks (
    blocker_id  UUID REFERENCES users(id) ON DELETE CASCADE,
    blocked_id  UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker_id, blocked_id),
    CHECK (blocker_id <> blocked_id)
);
-- Engelleme karşılıklı uygulanır: sorgularda iki yönlü kontrol edilir.

CREATE TABLE reports (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reported_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    context       TEXT NOT NULL CHECK (context IN ('profile','chat','invitation','event')),
    message_id    UUID REFERENCES messages(id) ON DELETE SET NULL,
    reason        TEXT NOT NULL,               -- spam, taciz, sahte hesap, uygunsuz foto, diğer
    details       TEXT,
    priority      SMALLINT NOT NULL DEFAULT 1, -- safety_alerts kaynaklı = yüksek
    status        TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','reviewing','actioned','dismissed')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at   TIMESTAMPTZ
);

CREATE TABLE moderation_actions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id    UUID NOT NULL,
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    report_id   UUID REFERENCES reports(id) ON DELETE SET NULL,
    action      TEXT NOT NULL,                 -- warn, suspend, ban, photo_reject, dismiss
    note        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================================
-- ETKİNLİKLER
-- =========================================================
CREATE TABLE events (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cafe_id      UUID NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    description  TEXT,
    category     TEXT,                         -- quiz, tasting, boardgames, networking
    starts_at    TIMESTAMPTZ NOT NULL,
    ends_at      TIMESTAMPTZ NOT NULL,
    capacity     INT,
    status       TEXT NOT NULL DEFAULT 'scheduled'
                 CHECK (status IN ('scheduled','cancelled','finished')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE event_attendees (
    event_id    UUID REFERENCES events(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (event_id, user_id)
);

-- =========================================================
-- İSTATİSTİK (kafe paneli): yalnızca toplulaştırılmış, k >= 5
-- =========================================================
CREATE VIEW cafe_hourly_checkins AS
SELECT cafe_id,
       date_trunc('hour', started_at) AS hour,
       COUNT(*) AS checkin_count
FROM checkins
GROUP BY cafe_id, date_trunc('hour', started_at)
HAVING COUNT(*) >= 5;

-- =========================================================
-- REDIS (SQL dışı, geçici veri)
-- =========================================================
--  presence:{cafe_id}        SET   aktif ve görünür kullanıcı id'leri (TTL = check-in süresi)
--  qr:{cafe_id}:{window}     dönen QR token doğrulaması (5-10 dk pencere)
--  ratelimit:like:{user_id}  check-in başına tanışma limiti sayacı (örn. 15)
--  otp:{phone_hash}          SMS OTP (kısa TTL)

-- =========================================================
-- SAKLAMA SÜRELERİ (KVKK), zamanlanmış temizlik işleri
-- =========================================================
--  checkin_attempts : 30 gün
--  checkins         : 90 gün sonra user_id anonimleştirilir (istatistik için sayı kalır)
--  messages         : hesap silinince silinir; şikâyete bağlı olanlar inceleme süresince saklanır
--  hesap silme      : users.status='deleted', kişisel alanlar temizlenir, fotoğraflar silinir
