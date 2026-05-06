const { pool } = require('../db')

// Must be used AFTER authMiddleware. Looks up the current role in DB (not JWT)
// so revoking admin takes effect immediately even if the user's token is still valid.
async function requireAdmin(req, res, next) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
    const [rows] = await pool.query(
      'SELECT role FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [req.user.id]
    )
    if (!rows.length) return res.status(401).json({ error: 'User not found' })
    const role = rows[0].role
    if (role !== 'admin' && role !== 'mod') {
      return res.status(403).json({ error: 'Forbidden' })
    }
    req.user.role = role
    next()
  } catch (err) {
    console.error('[requireAdmin]', err)
    res.status(500).json({ error: 'Internal error' })
  }
}

module.exports = { requireAdmin }
