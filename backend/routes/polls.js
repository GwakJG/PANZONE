const express = require('express')
const { pool } = require('../db')
const { authMiddleware, optionalAuth } = require('../middleware/auth')

const router = express.Router()

const MAX_OPTION_IDX = 5

function parseId(raw) {
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null
  const n = Number(raw)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

async function getState(postId, userId) {
  const [rows] = await pool.query(
    'SELECT option_idx, COUNT(*) AS c FROM poll_votes WHERE post_id = ? GROUP BY option_idx',
    [postId]
  )
  const counts = {}
  for (const r of rows) counts[r.option_idx] = Number(r.c)

  let myVote = null
  if (userId) {
    const [mine] = await pool.query(
      'SELECT option_idx FROM poll_votes WHERE post_id = ? AND user_id = ?',
      [postId, userId]
    )
    if (mine.length) myVote = mine[0].option_idx
  }
  return { counts, myVote }
}

// GET /api/polls/:postId
router.get('/:postId', optionalAuth, async (req, res) => {
  try {
    const postId = parseId(req.params.postId)
    if (!postId) return res.status(400).json({ error: 'Invalid post id' })
    const state = await getState(postId, req.user?.id)
    res.json(state)
  } catch (err) {
    console.error('[polls:get]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// POST /api/polls/:postId/vote { optionIdx }
router.post('/:postId/vote', authMiddleware, async (req, res) => {
  try {
    const postId = parseId(req.params.postId)
    if (!postId) return res.status(400).json({ error: 'Invalid post id' })
    const { optionIdx } = req.body || {}
    if (!Number.isInteger(optionIdx) || optionIdx < 0 || optionIdx > MAX_OPTION_IDX) {
      return res.status(400).json({ error: 'Invalid optionIdx' })
    }

    const [posts] = await pool.query(
      'SELECT id FROM posts WHERE id = ? AND deleted_at IS NULL',
      [postId]
    )
    if (!posts.length) return res.status(404).json({ error: 'Post not found' })

    const [existing] = await pool.query(
      'SELECT option_idx FROM poll_votes WHERE post_id = ? AND user_id = ?',
      [postId, req.user.id]
    )

    if (existing.length) {
      if (existing[0].option_idx === optionIdx) {
        await pool.query(
          'DELETE FROM poll_votes WHERE post_id = ? AND user_id = ?',
          [postId, req.user.id]
        )
      } else {
        await pool.query(
          'UPDATE poll_votes SET option_idx = ?, created_at = CURRENT_TIMESTAMP WHERE post_id = ? AND user_id = ?',
          [optionIdx, postId, req.user.id]
        )
      }
    } else {
      await pool.query(
        'INSERT INTO poll_votes (post_id, user_id, option_idx) VALUES (?, ?, ?)',
        [postId, req.user.id, optionIdx]
      )
    }

    const state = await getState(postId, req.user.id)
    res.json(state)
  } catch (err) {
    console.error('[polls:vote]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

module.exports = router
