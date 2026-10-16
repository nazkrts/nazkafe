-- Kafe paneli: personel hesapları devre dışı bırakılabilir, "Rahatsızım" uyarısı kafe tarafında onaylanabilir.
ALTER TABLE cafe_accounts
    ADD COLUMN status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
    ADD COLUMN last_login_at TIMESTAMPTZ,
    ADD CONSTRAINT cafe_accounts_email_lower CHECK (email = lower(email));

ALTER TABLE safety_alerts ADD COLUMN cafe_ack_at TIMESTAMPTZ;   -- kafe ekibi uyarıyı gördü
CREATE INDEX safety_alerts_cafe ON safety_alerts(cafe_id, created_at DESC) WHERE notify_cafe;
