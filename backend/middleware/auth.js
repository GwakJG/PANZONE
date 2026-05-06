const jwt = require('jsonwebtoken')
const { pool } = require('../db')
const { bumpAchievedTier } = require('../lib/tier')

const JWT_SECRET = process.env.JWT_SECRET || 'dev-insecure-secret-change-me'
// Persistent (자동 로그인 ON) 토큰: 브라우저를 닫아도 유지되는 localStorage 보관용 — 30일.
// 비-persistent (기본): 세션 단위 sessionStorage 보관용 — 1일이면 충분.
const JWT_EXPIRES_PERSISTENT = '30d'
const JWT_EXPIRES_SESSION = '1d'

function sign(user, { persistent = false } = {}) {
  const expiresIn = persistent ? JWT_EXPIRES_PERSISTENT : JWT_EXPIRES_SESSION
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn })
}

// Fire-and-forget: at most one increment per user per day (enforced by WHERE clause).
// If the row already has today's date, the UPDATE matches zero rows - no-op.
// Also bumps achieved_tier when the visit pushes the user past a threshold.
async function trackDailyVisit(userId) {
  try {
    const [result] = await pool.query(
      `UPDATE users
       SET visit_count = visit_count + 1,
           last_visit_date = CURDATE()
       WHERE id = ?
         AND (last_visit_date IS NULL OR last_visit_date < CURDATE())`,
      [userId]
    )
    if (result.affectedRows > 0) {
      bumpAchievedTier(pool, userId)
    }
  } catch (err) {
    console.error('[visit]', err.message)
  }
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  try {
    req.user = jwt.verify(token, JWT_SECRET)
    trackDailyVisit(req.user.id)
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

function optionalAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET)
      trackDailyVisit(req.user.id)
    } catch { /* ignore */ }
  }
  next()
}

module.exports = { authMiddleware, optionalAuth, sign, JWT_SECRET }
