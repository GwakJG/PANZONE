const express = require('express')
const { pool } = require('../db')
const { authMiddleware } = require('../middleware/auth')

const router = express.Router()

const LIMIT = 12
const TERM_MAX = 100

// GET /api/searches — my recent terms
router.get('/', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT term FROM user_searches WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?',
      [req.user.id, LIMIT]
    )
    res.json({ terms: rows.map(r => r.term) })
  } catch (err) {
    console.error('[searches:list]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// POST /api/searches { term } — upsert (bumps updated_at)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const term = (req.body?.term || '').trim()
    if (!term) return res.status(400).json({ error: 'term required' })
    if (term.length > TERM_MAX) return res.status(400).json({ error: 'term too long' })

    await pool.query(
      `INSERT INTO user_searches (user_id, term) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP`,
      [req.user.id, term]
    )

    // Trim to LIMIT entries per user (delete oldest beyond limit)
    await pool.query(
      `DELETE FROM user_searches
       WHERE user_id = ?
         AND term NOT IN (
           SELECT term FROM (
             SELECT term FROM user_searches
             WHERE user_id = ?
             ORDER BY updated_at DESC
             LIMIT ?
           ) keep
         )`,
      [req.user.id, req.user.id, LIMIT]
    )

    res.json({ ok: true })
  } catch (err) {
    console.error('[searches:create]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// DELETE /api/searches?term=X — remove one; if term absent, clear all
router.delete('/', authMiddleware, async (req, res) => {
  try {
    const term = req.query.term
    if (term !== undefined) {
      await pool.query(
        'DELETE FROM user_searches WHERE user_id = ? AND term = ?',
        [req.user.id, String(term)]
      )
    } else {
      await pool.query('DELETE FROM user_searches WHERE user_id = ?', [req.user.id])
    }
    res.json({ ok: true })
  } catch (err) {
    console.error('[searches:delete]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

module.exports = router
