export const ONBOARDING_SQL = {
  insertUser: `INSERT INTO users (phone_hash, phone_enc, email, display_name, birth_date)
               VALUES ($1::text, $2::bytea, $3::text, $4::text, $5::date)
               RETURNING id`,
  insertConsent: `INSERT INTO consents (user_id, type, version, granted) VALUES ($1, $2, $3, $4)`,
};
