// Blocks suspended users from write actions. Read-only access still works
// (same as a logged-out user). Must be used AFTER authMiddleware.
const { pool } = require('../db')

async function requireActive(req, res, next) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
    const [rows] = await pool.query(
      'SELECT suspended_at FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [req.user.id]
    )
    if (!rows.length) return res.status(401).json({ error: 'User not found' })
    if (rows[0].suspended_at) {
      return res.status(403).json({ error: 'Account suspended' })
    }
    next()
  } catch (err) {
    console.error('[requireActive]', err)
    res.status(500).json({ error: 'Internal error' })
  }
}

module.exports = { requireActive }
