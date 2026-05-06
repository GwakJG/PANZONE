const express = require('express')
const { pool, formatDateOnly } = require('../db')
const { calcTier } = require('../lib/tier')
const { optionalAuth } = require('../middleware/auth')
const { isAdminViewer } = require('../lib/viewer')

const router = express.Router()

const MAX_PAGE_SIZE = 50
const DEFAULT_PAGE_SIZE = 20

const SORT_COLUMN = {
  date: 'p.created_at',
  views: 'p.view_count',
  comments: 'p.comment_count',
  likes: 'p.like_count',
}

function serializePostRow(row, authorTier) {
  return {
    id: row.id,
    boardSlug: row.board_slug,
    title: row.title,
    author: row.author_name,
    authorAvatar: row.author_avatar,
    authorTier,
    userId: row.user_id,
    pinned: !!row.is_pinned,
    views: row.view_count,
    likeCount: row.like_count,
    commentCount: row.comment_count,
    thumbnail: row.thumbnail || null,
    date: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  }
}

// GET /api/users/:name
router.get('/:name', optionalAuth, async (req, res) => {
  try {
    const name = req.params.name
    if (!name) return res.status(400).json({ error: 'name required' })

    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.avatar_url, u.bio, u.role, u.created_at,
              u.post_count, u.comment_count, u.visit_count, u.last_visit_date, u.achieved_tier,
              u.suspended_at, u.suspend_reason, u.data_purged_at,
              (SELECT COUNT(*) FROM posts p
                 WHERE p.user_id = u.id AND p.deleted_at IS NULL AND p.admin_notice_at IS NULL
              ) AS visible_post_count
         FROM users u
        WHERE u.name = ? AND u.deleted_at IS NULL
        LIMIT 1`,
      [name]
    )
    if (!rows.length) return res.status(404).json({ error: 'User not found' })
    const u = rows[0]

    // Suspended profile hidden from non-admins, but owner (self) can still view
    // it to see the banner + submit an appeal via 문의하기.
    if (u.suspended_at) {
      const isSelf = req.user && req.user.id === u.id
      if (!isSelf) {
        const adminViewer = await isAdminViewer(req)
        if (!adminViewer) return res.status(404).json({ error: 'User not found' })
      }
    }

    res.json({
      user: {
        id: u.id,
        name: u.name,
        avatarUrl: u.avatar_url,
        bio: u.bio,
        createdAt: u.created_at instanceof Date ? u.created_at.toISOString() : u.created_at,
        tier: calcTier(u),
        // visible_post_count excludes admin notices; the raw u.post_count still
        // drives tier calc above but this is what the profile badge displays.
        postCount: u.visible_post_count,
        commentCount: u.comment_count,
        visitCount: u.visit_count,
        lastVisitDate: formatDateOnly(u.last_visit_date),
        suspended: !!u.suspended_at,
        suspendReason: u.suspend_reason || null,
        suspendedAt: u.suspended_at
          ? (u.suspended_at instanceof Date ? u.suspended_at.toISOString() : u.suspended_at)
          : null,
        dataPurged: !!u.data_purged_at,
      },
    })
  } catch (err) {
    console.error('[users:get]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// GET /api/users/:name/posts?page=1&pageSize=20
router.get('/:name/posts', optionalAuth, async (req, res) => {
  try {
    const name = req.params.name
    const page = Math.max(1, parseInt(req.query.page, 10) || 1)
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query.pageSize, 10) || DEFAULT_PAGE_SIZE))
    const offset = (page - 1) * pageSize
    const sortKey = SORT_COLUMN[req.query.sort] ? req.query.sort : 'date'
    const sortCol = SORT_COLUMN[sortKey]
    const order = req.query.order === 'asc' ? 'ASC' : 'DESC'

    const [userRows] = await pool.query(
      `SELECT id, role, created_at, post_count, comment_count, visit_count, achieved_tier, suspended_at
       FROM users WHERE name = ? AND deleted_at IS NULL LIMIT 1`,
      [name]
    )
    if (!userRows.length) return res.status(404).json({ error: 'User not found' })
    const userRow = userRows[0]

    // Non-admins can't read posts of a suspended user — except the owner viewing themselves.
    if (userRow.suspended_at) {
      const isSelf = req.user && req.user.id === userRow.id
      if (!isSelf) {
        const adminViewer = await isAdminViewer(req)
        if (!adminViewer) return res.status(404).json({ error: 'User not found' })
      }
    }

    const userId = userRow.id
    // All posts here are authored by this same user, so tier is constant.
    const authorTier = calcTier(userRow)

    // Admin-authored notices (admin_notice_at NOT NULL) belong in /admin/notices,
    // not in the author's personal profile — hide them from every viewer including
    // the admin themselves. This also covers released notices automatically.
    const noticeFilter = 'AND p.admin_notice_at IS NULL'

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM posts p WHERE p.user_id = ? AND p.deleted_at IS NULL ${noticeFilter}`,
      [userId]
    )
    const total = countRows[0].total

    const [rows] = await pool.query(
      `SELECT p.id, p.title, p.is_pinned, p.view_count, p.like_count, p.comment_count,
              p.created_at, p.user_id,
              u.name AS author_name, u.avatar_url AS author_avatar,
              b.slug AS board_slug,
              (SELECT pi.url FROM post_images pi WHERE pi.post_id = p.id ORDER BY pi.sort_order LIMIT 1) AS thumbnail
       FROM posts p
       JOIN users u ON u.id = p.user_id
       JOIN boards b ON b.id = p.board_id
       WHERE p.user_id = ? AND p.deleted_at IS NULL ${noticeFilter}
       ORDER BY ${sortCol} ${order}, p.id DESC
       LIMIT ? OFFSET ?`,
      [userId, pageSize, offset]
    )

    res.json({
      posts: rows.map(r => serializePostRow(r, authorTier)),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    })
  } catch (err) {
    console.error('[users:posts]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

module.exports = router
