export const AUTH_SQL = {
  findUserByPhoneHash: `SELECT id, status FROM users WHERE phone_hash = $1`,
  findUserByEmail: `SELECT id, status FROM users WHERE email = $1`,
  userStatus: `SELECT id, status FROM users WHERE id = $1`,
};
