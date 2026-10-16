export const BLOCKS_SQL = {
  userExists: `SELECT 1 FROM users WHERE id = $1 AND status <> 'deleted'`,
  insertBlock: `INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
  // Engellenen çiftin eşleşmesi kapanır; sohbet ve davetler artık erişilemez olur
  blockMatch: `UPDATE matches SET status = 'blocked'
               WHERE user_a_id = LEAST($1::uuid, $2::uuid) AND user_b_id = GREATEST($1::uuid, $2::uuid)
                 AND status <> 'blocked'`,
  cancelInvitations: `UPDATE invitations SET status = 'cancelled', responded_at = now()
                      WHERE status IN ('pending','later','accepted')
                        AND ((from_user_id = $1::uuid AND to_user_id = $2::uuid)
                          OR (from_user_id = $2::uuid AND to_user_id = $1::uuid))`,
  removeBlock: `DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2`,
  listMine: `SELECT u.id AS user_id, u.display_name, b.created_at
             FROM blocks b JOIN users u ON u.id = b.blocked_id
             WHERE b.blocker_id = $1 ORDER BY b.created_at DESC`,
};
