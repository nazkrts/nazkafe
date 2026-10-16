-- =========================================================
-- YÖNETİM (moderasyon) HESAPLARI
-- Kullanıcı hesaplarından ayrıdır; ayrı JWT rolü ('admin') kullanır.
-- =========================================================
CREATE TABLE admins (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email          TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
    password_hash  TEXT NOT NULL,                 -- scrypt; düz parola saklanmaz
    display_name   TEXT NOT NULL,
    role           TEXT NOT NULL DEFAULT 'moderator' CHECK (role IN ('moderator','admin')),
    status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at  TIMESTAMPTZ
);

-- Her moderasyon işlemi bir yönetici hesabına bağlıdır (silinmez, devre dışı bırakılır)
ALTER TABLE moderation_actions
    ADD CONSTRAINT moderation_actions_admin_fk FOREIGN KEY (admin_id) REFERENCES admins(id);
CREATE INDEX moderation_actions_user ON moderation_actions(user_id, created_at DESC);
CREATE INDEX reports_queue ON reports(status, priority DESC, created_at);
