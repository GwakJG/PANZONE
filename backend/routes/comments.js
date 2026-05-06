const express = require('express')
const { pool } = require('../db')
const { authMiddleware, optionalAuth } = require('../middleware/auth')
const { requireActive } = require('../middleware/requireActive')
const { bumpAchievedTier, calcTier } = require('../lib/tier')
const { isAdminViewer } = require('../lib/viewer')

const AUTHOR_TIER_COLUMNS = `
  u.role AS author_role,
  u.created_at AS author_created_at,
  u.post_count AS author_post_count,
  u.comment_count AS author_comment_count,
  u.visit_count AS author_visit_count,
  u.achieved_tier AS author_achieved_tier
`

function authorTierOf(row) {
  return calcTier({
    role: row.author_role,
    created_at: row.author_created_at,
    post_count: row.author_post_count,
    comment_count: row.author_comment_count,
    visit_count: row.author_visit_count,
    achieved_tier: row.author_achieved_tier,
  })
}

const router = express.Router()

const BODY_MAX = 400
const IMAGE_URL_MAX = 500

function parseId(raw) {
  if (typeof raw === 'number') {
    return Number.isSafeInteger(raw) && raw > 0 ? raw : null
  }
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null
  const n = Number(raw)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

function serialize(row, { adminViewer = false, viewerId = null } = {}) {
  const created = row.created_at instanceof Date ? row.created_at : new Date(row.created_at)
  const updated = row.updated_at ? (row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at)) : null
  const reallyDeleted = !!row.deleted_at
  // Author-suspension hides the comment from everyone EXCEPT the author themselves
  // (so suspended users can still see their own comments) and admins.
  const authorSuspended = !!row.author_suspended_at && !adminViewer && viewerId !== row.user_id
  const hidden = reallyDeleted || authorSuspended
  const tombstoneReason = reallyDeleted ? 'deleted' : (authorSuspended ? 'suspended' : null)
  return {
    id: row.id,
    postId: row.post_id,
    parentId: row.parent_id,
    userId: hidden ? null : row.user_id,
    author: hidden ? null : row.author_name,
    authorAvatar: hidden ? null : (row.author_avatar || null),
    authorTier: hidden ? null : authorTierOf(row),
    text: hidden ? null : row.body,
    image: hidden ? null : row.image_url,
    date: created.toISOString(),
    edited: !hidden && !!(updated && +updated > +created),
    deleted: hidden,
    tombstoneReason,
  }
}

// GET /api/comments?postId=X
router.get('/', optionalAuth, async (req, res) => {
  try {
    const postId = parseId(req.query.postId)
    if (!postId) return res.status(400).json({ error: 'postId required' })

    const adminViewer = await isAdminViewer(req)
    const viewerId = req.user ? req.user.id : null

    const [rows] = await pool.query(
      `SELECT c.id, c.post_id, c.user_id, c.parent_id, c.body, c.image_url,
              c.created_at, c.updated_at, c.deleted_at,
              u.name AS author_name, u.avatar_url AS author_avatar,
              u.suspended_at AS author_suspended_at,
              ${AUTHOR_TIER_COLUMNS}
       FROM comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.post_id = ?
       ORDER BY c.created_at ASC`,
      [postId]
    )

    const top = []
    const byId = new Map()
    for (const row of rows) {
      if (row.parent_id === null) {
        const c = { ...serialize(row, { adminViewer, viewerId }), replies: [] }
        byId.set(row.id, c)
        top.push(c)
      }
    }
    for (const row of rows) {
      if (row.parent_id !== null) {
        const parent = byId.get(row.parent_id)
        if (parent) parent.replies.push(serialize(row, { adminViewer, viewerId }))
      }
    }
    top.sort((a, b) => new Date(b.date) - new Date(a.date))

    res.json({ comments: top })
  } catch (err) {
    console.error('[comments:list]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// POST /api/comments { postId, body, imageUrl?, parentId? }
router.post('/', authMiddleware, requireActive, async (req, res) => {
  try {
    const { postId: rawPostId, body, imageUrl, parentId: rawParentId } = req.body || {}
    const postId = parseId(rawPostId)
    if (!postId) return res.status(400).json({ error: 'postId required' })
    if (!body || !body.trim()) return res.status(400).json({ error: 'Body required' })
    if (body.length > BODY_MAX) return res.status(400).json({ error: 'Body too long' })

    let storedImage = null
    if (imageUrl) {
      if (typeof imageUrl !== 'string' || imageUrl.length > IMAGE_URL_MAX) {
        return res.status(400).json({ error: 'Image URL too long' })
      }
      storedImage = imageUrl
    }

    const [posts] = await pool.query(
      'SELECT id, user_id FROM posts WHERE id = ? AND deleted_at IS NULL',
      [postId]
    )
    if (!posts.length) return res.status(404).json({ error: 'Post not found' })
    const postOwnerId = posts[0].user_id

    let parentId = null
    if (rawParentId !== undefined && rawParentId !== null) {
      parentId = parseId(rawParentId)
      if (!parentId) return res.status(400).json({ error: 'Invalid parentId' })

      const [parents] = await pool.query(
        'SELECT parent_id, post_id FROM comments WHERE id = ? AND deleted_at IS NULL',
        [parentId]
      )
      if (!parents.length) return res.status(404).json({ error: 'Parent comment not found' })
      if (parents[0].post_id !== postId) return res.status(400).json({ error: 'Parent from different post' })
      if (parents[0].parent_id !== null) return res.status(400).json({ error: 'Only one-level replies allowed' })
    }

    const [result] = await pool.query(
      'INSERT INTO comments (post_id, user_id, parent_id, body, image_url) VALUES (?, ?, ?, ?, ?)',
      [postId, req.user.id, parentId, body.trim(), storedImage]
    )
    await pool.query(
      'UPDATE posts SET comment_count = (SELECT COUNT(*) FROM comments WHERE post_id = ?) WHERE id = ?',
      [postId, postId]
    )
    // Count toward user.comment_count EXCEPT top-level comments on own post (anti-farming).
    const countsForTier = !(postOwnerId === req.user.id && parentId === null)
    if (countsForTier) {
      await pool.query(
        'UPDATE users SET comment_count = comment_count + 1 WHERE id = ?',
        [req.user.id]
      )
      bumpAchievedTier(pool, req.user.id)
    }

    res.json({ id: result.insertId })
  } catch (err) {
    console.error('[comments:create]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// PATCH /api/comments/:id { body }
router.patch('/:id', authMiddleware, requireActive, async (req, res) => {
  try {
    const id = parseId(req.params.id)
    if (!id) return res.status(400).json({ error: 'Invalid comment id' })
    const { body } = req.body || {}
    if (!body || !body.trim()) return res.status(400).json({ error: 'Body required' })
    if (body.length > BODY_MAX) return res.status(400).json({ error: 'Body too long' })

    const [rows] = await pool.query(
      'SELECT user_id FROM comments WHERE id = ? AND deleted_at IS NULL',
      [id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Comment not found' })
    if (rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' })

    await pool.query('UPDATE comments SET body = ? WHERE id = ?', [body.trim(), id])
    res.json({ ok: true })
  } catch (err) {
    console.error('[comments:update]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// DELETE /api/comments/:id  (soft delete)
router.delete('/:id', authMiddleware, requireActive, async (req, res) => {
  try {
    const id = parseId(req.params.id)
    if (!id) return res.status(400).json({ error: 'Invalid comment id' })

    const [rows] = await pool.query(
      `SELECT c.user_id, c.post_id, c.parent_id, p.user_id AS post_owner_id
       FROM comments c
       JOIN posts p ON p.id = c.post_id
       WHERE c.id = ? AND c.deleted_at IS NULL`,
      [id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Comment not found' })
    if (rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' })

    await pool.query('UPDATE comments SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [id])
    // Post-level comment_count includes tombstones (keeps comment thread structure).
    // User-level counter only decrements if this comment was counted on creation
    // (i.e., NOT a top-level comment on own post).
    const wasCounted = !(rows[0].post_owner_id === req.user.id && rows[0].parent_id === null)
    if (wasCounted) {
      await pool.query(
        'UPDATE users SET comment_count = GREATEST(comment_count, 1) - 1 WHERE id = ?',
        [req.user.id]
      )
    }
    res.json({ ok: true })
  } catch (err) {
    console.error('[comments:delete]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

module.exports = router
