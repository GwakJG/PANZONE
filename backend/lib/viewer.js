// Resolve whether the current request's viewer is admin/mod.
// Uses DB (not JWT role) so role revocations take effect immediately.
// Call only on endpoints that need visibility-based filtering — adds 1 small indexed query.
const { pool } = require('../db')

async function isAdminViewer(req) {
  if (!req.user) return false
  const [rows] = await pool.query(
    "SELECT role FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1",
    [req.user.id]
  )
  const role = rows[0]?.role
  return role === 'admin' || role === 'mod'
}

module.exports = { isAdminViewer }
