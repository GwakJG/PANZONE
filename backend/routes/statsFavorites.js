const express = require('express')
const { pool } = require('../db')
const { authMiddleware } = require('../middleware/auth')

const router = express.Router()

const PLAYER_MAX = 100
const PLATFORM_MAX = 20
const ALLOWED_PLATFORMS = new Set(['steam', 'kakao'])

function validate(player, platform) {
  if (!player || typeof player !== 'string') return 'player required'
  if (player.length > PLAYER_MAX) return 'player too long'
  if (!platform || typeof platform !== 'string') return 'platform required'
  if (platform.length > PLATFORM_MAX) return 'platform too long'
  if (!ALLOWED_PLATFORMS.has(platform)) return 'invalid platform'
  return null
}

// GET /api/stats-favorites — my favorites (oldest first to preserve add order)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT player, platform, UNIX_TIMESTAMP(created_at) * 1000 AS timestamp
       FROM user_stats_favorites
       WHERE user_id = ?
       ORDER BY created_at ASC`,
      [req.user.id]
    )
    res.json({ items: rows })
  } catch (err) {
    console.error('[stats-favorites:list]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// POST /api/stats-favorites { player, platform } — upsert
router.post('/', authMiddleware, async (req, res) => {
  try {
    const player = (req.body?.player || '').trim()
    const platform = (req.body?.platform || '').trim()
    const err = validate(player, platform)
    if (err) return res.status(400).json({ error: err })

    await pool.query(
      `INSERT IGNORE INTO user_stats_favorites (user_id, player, platform)
       VALUES (?, ?, ?)`,
      [req.user.id, player, platform]
    )
    res.json({ ok: true })
  } catch (e) {
    console.error('[stats-favorites:create]', e)
    res.status(500).json({ error: 'Internal error' })
  }
})

// DELETE /api/stats-favorites?player=X&platform=Y — remove one; if both absent, clear all
router.delete('/', authMiddleware, async (req, res) => {
  try {
    const player = req.query.player
    const platform = req.query.platform
    if (player !== undefined && platform !== undefined) {
      await pool.query(
        'DELETE FROM user_stats_favorites WHERE user_id = ? AND player = ? AND platform = ?',
        [req.user.id, String(player), String(platform)]
      )
    } else if (player === undefined && platform === undefined) {
      await pool.query('DELETE FROM user_stats_favorites WHERE user_id = ?', [req.user.id])
    } else {
      return res.status(400).json({ error: 'player and platform must both be provided' })
    }
    res.json({ ok: true })
  } catch (err) {
    console.error('[stats-favorites:delete]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

module.exports = router
