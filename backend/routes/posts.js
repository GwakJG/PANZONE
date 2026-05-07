const express = require('express')
const { pool } = require('../db')
const { authMiddleware, optionalAuth } = require('../middleware/auth')
const { requireActive } = require('../middleware/requireActive')
const { bumpAchievedTier, calcTier } = require('../lib/tier')
const { isAdminViewer } = require('../lib/viewer')
const { sendNotification } = require('../lib/notify')
const { hasTabs, isValidTab } = require('../lib/boardTabs')

// JOIN aliases used across queries that need the post author's tier.
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

const MAX_PAGE_SIZE = 50
const DEFAULT_PAGE_SIZE = 20
const TITLE_MAX = 40
const BODY_MAX = 200 * 1024

function extractFirstImage(html) {
  if (!html) return null
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i)
  if (!m) return null
  const url = m[1]
  return url.length <= 500 ? url : null
}

function serializePostRow(row) {
  return {
    id: row.id,
    boardSlug: row.board_slug,
    title: row.title,
    subcategory: row.subcategory || null,
    author: row.author_name,
    authorAvatar: row.author_avatar,
    authorTier: authorTierOf(row),
    userId: row.user_id,
    pinned: !!row.is_pinned,
    views: row.view_count,
    likeCount: row.like_count,
    commentCount: row.comment_count,
    thumbnail: row.thumbnail || null,
    date: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  }
}

// Recount like/dislike from reactions table and persist to posts; returns fresh totals.
async function syncReactionCounts(postId) {
  const [rows] = await pool.query(
    `SELECT
       SUM(type='like') AS likes,
       SUM(type='dislike') AS dislikes
     FROM reactions WHERE post_id = ?`,
    [postId]
  )
  const likes = Number(rows[0].likes) || 0
  const dislikes = Number(rows[0].dislikes) || 0
  await pool.query(
    'UPDATE posts SET like_count = ?, dislike_count = ? WHERE id = ?',
    [likes, dislikes, postId]
  )
  return { likeCount: likes, dislikeCount: dislikes }
}

const VIEWED_COOKIE = 'pubgop_pv'
const VIEWED_MAX = 200
const VIEWED_TTL_MS = 24 * 60 * 60 * 1000

function parseViewedCookie(req) {
  const raw = (req.headers.cookie || '')
    .split(/;\s*/)
    .find(c => c.startsWith(`${VIEWED_COOKIE}=`))
  if (!raw) return new Set()
  const value = raw.slice(VIEWED_COOKIE.length + 1)
  return new Set(value.split(',').filter(Boolean))
}

// In-memory short-window dedup. Defends against double-fires that the
// permanent dedup (post_views row / cookie set) can't catch in time:
//   - React StrictMode runs effects twice in dev → two GETs in <100ms
//   - Browser/preview prefetchers, retry libraries, double-clicks
// Key: `<userId|ip>:<postId>`. Entries expire after VIEW_DEDUP_WINDOW_MS.
// Cleanup runs lazily — every N inserts we drop expired entries so the map
// can't grow unbounded.
const VIEW_DEDUP_WINDOW_MS = 10_000
const VIEW_DEDUP_CLEANUP_EVERY = 500
const recentViewHits = new Map()
let viewDedupInsertCount = 0

function recentViewSeen(req, postId) {
  const id = req.user ? `u${req.user.id}` : `ip${req.ip || 'anon'}`
  const key = `${id}:${postId}`
  const now = Date.now()
  const last = recentViewHits.get(key)
  if (last !== undefined && now - last < VIEW_DEDUP_WINDOW_MS) return true
  recentViewHits.set(key, now)
  if (++viewDedupInsertCount % VIEW_DEDUP_CLEANUP_EVERY === 0) {
    for (const [k, t] of recentViewHits) {
      if (now - t >= VIEW_DEDUP_WINDOW_MS) recentViewHits.delete(k)
    }
  }
  return false
}

function parseId(raw) {
  if (!/^\d+$/.test(raw)) return null
  const n = Number(raw)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

async function resolveBoard(slug) {
  const [rows] = await pool.query(
    'SELECT id, slug, is_writable FROM boards WHERE slug = ? LIMIT 1',
    [slug]
  )
  return rows[0] || null
}

// GET /api/posts?board=free&page=1&pageSize=20&q=...&field=title|body|both|author
// board is required unless searching across all boards via ?all=1
router.get('/', optionalAuth, async (req, res) => {
  try {
    const boardSlug = req.query.board
    const allBoards = req.query.all === '1'
    let board = null
    if (!allBoards) {
      if (!boardSlug) return res.status(400).json({ error: 'board query required' })
      board = await resolveBoard(boardSlug)
      if (!board) return res.status(404).json({ error: 'Board not found' })
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1)
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query.pageSize, 10) || DEFAULT_PAGE_SIZE))
    const offset = (page - 1) * pageSize
    const q = (req.query.q || '').trim()
    const field = ['title', 'body', 'both', 'author', 'all'].includes(req.query.field)
      ? req.query.field
      : 'both'

    const adminViewer = await isAdminViewer(req)

    const where = ['p.deleted_at IS NULL']
    const params = []
    // Released admin notices (admin_notice_at set & is_pinned=0) are gone from
    // the board — applied to admins too so a released notice no longer shows
    // up as a "regular post". Admin can still see/manage these in /admin/notices.
    where.push('(p.admin_notice_at IS NULL OR p.is_pinned = 1)')
    if (!adminViewer) where.push('u.suspended_at IS NULL')
    if (board) {
      where.push('p.board_id = ?')
      params.push(board.id)
    }
    const subcategory = (req.query.subcategory || '').trim()
    if (subcategory && board && isValidTab(board.slug, subcategory)) {
      where.push('p.subcategory = ?')
      params.push(subcategory)
    }
    if (q) {
      const like = `%${q}%`
      if (field === 'title') {
        where.push('p.title LIKE ?')
        params.push(like)
      } else if (field === 'body') {
        where.push('p.body LIKE ?')
        params.push(like)
      } else if (field === 'author') {
        where.push('u.name LIKE ?')
        params.push(like)
      } else if (field === 'all') {
        where.push('(p.title LIKE ? OR p.body LIKE ? OR u.name LIKE ?)')
        params.push(like, like, like)
      } else {
        where.push('(p.title LIKE ? OR p.body LIKE ?)')
        params.push(like, like)
      }
    }
    const whereSql = where.join(' AND ')

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM posts p JOIN users u ON u.id = p.user_id WHERE ${whereSql}`,
      params
    )
    const total = countRows[0].total

    const [rows] = await pool.query(
      `SELECT p.id, p.title, p.subcategory, p.is_pinned, p.view_count, p.like_count, p.comment_count,
              p.created_at, p.user_id,
              u.name AS author_name, u.avatar_url AS author_avatar,
              ${AUTHOR_TIER_COLUMNS},
              b.slug AS board_slug,
              (SELECT pi.url FROM post_images pi WHERE pi.post_id = p.id ORDER BY pi.sort_order LIMIT 1) AS thumbnail
       FROM posts p
       JOIN users u ON u.id = p.user_id
       JOIN boards b ON b.id = p.board_id
       WHERE ${whereSql}
       ORDER BY p.is_pinned DESC, p.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    )

    res.json({
      posts: rows.map(serializePostRow),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    })
  } catch (err) {
    console.error('[posts:list]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// GET /api/posts/featured  (carousel items — posts + standalone banners, mixed by display_order)
router.get('/featured', optionalAuth, async (req, res) => {
  try {
    const adminViewer = await isAdminViewer(req)
    // Banner rows always pass. For post rows: released admin notices are gone
    // for everyone (admins included, to keep the carousel consistent). Suspended
    // authors are hidden only for non-admins.
    const suspendedCheck = adminViewer
      ? ''
      : "AND (f.type = 'banner' OR u.suspended_at IS NULL)"
    const viewerFilters = `
      AND (f.type = 'banner' OR p.admin_notice_at IS NULL OR p.is_pinned = 1)
      ${suspendedCheck}
    `
    const [rows] = await pool.query(
      `SELECT f.id AS featured_id, f.type, f.display_order,
              f.banner_image_url, f.banner_link_url, f.banner_title,
              p.id, p.title, p.is_pinned, p.view_count, p.like_count, p.comment_count,
              p.created_at, p.user_id,
              u.name AS author_name, u.avatar_url AS author_avatar,
              u.role AS author_role, u.created_at AS author_created_at,
              u.post_count AS author_post_count, u.comment_count AS author_comment_count,
              u.visit_count AS author_visit_count, u.achieved_tier AS author_achieved_tier,
              b.slug AS board_slug,
              (SELECT pi.url FROM post_images pi WHERE pi.post_id = p.id ORDER BY pi.sort_order LIMIT 1) AS thumbnail
       FROM featured_posts f
       LEFT JOIN posts p ON p.id = f.post_id AND p.deleted_at IS NULL
       LEFT JOIN users u ON u.id = p.user_id
       LEFT JOIN boards b ON b.id = p.board_id
       WHERE f.active = 1
         AND (f.type = 'banner' OR p.id IS NOT NULL)
         ${viewerFilters}
       ORDER BY f.display_order ASC, f.id ASC
       LIMIT 10`
    )
    const items = rows.map(r => {
      if (r.type === 'banner') {
        return {
          type: 'banner',
          featuredId: r.featured_id,
          displayOrder: r.display_order,
          title: r.banner_title || '',
          thumbnail: r.banner_image_url,
          linkUrl: r.banner_link_url || null,
        }
      }
      return { type: 'post', featuredId: r.featured_id, displayOrder: r.display_order, ...serializePostRow(r) }
    })
    res.json({ posts: items })
  } catch (err) {
    console.error('[posts:featured]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// GET /api/posts/hot?period=today|week
router.get('/hot', optionalAuth, async (req, res) => {
  try {
    const period = req.query.period === 'week' ? 'week' : 'today'
    const windowSql = period === 'week'
      ? 'p.created_at >= (CURDATE() - INTERVAL WEEKDAY(CURDATE()) DAY)'
      : 'p.created_at >= CURDATE()'
    const adminViewer = await isAdminViewer(req)
    // Hot board is for organic user content only. Exclude:
    //   - any currently-pinned post (is_pinned=1) — these are 공지 regardless of origin
    //   - any post that was ever an admin notice (admin_notice_at NOT NULL) — covers released notices too
    // Applied to admins and users alike so the board stays consistent.
    const noticeExclusion = 'AND p.is_pinned = 0 AND p.admin_notice_at IS NULL'
    const viewerFilters = adminViewer
      ? noticeExclusion
      : `AND u.suspended_at IS NULL ${noticeExclusion}`

    const [rows] = await pool.query(
      `SELECT p.id, p.title, p.subcategory, p.is_pinned, p.view_count, p.like_count, p.comment_count,
              p.created_at, p.user_id,
              u.name AS author_name, u.avatar_url AS author_avatar,
              ${AUTHOR_TIER_COLUMNS},
              b.slug AS board_slug,
              (p.view_count + p.like_count + p.comment_count) AS score,
              (SELECT pi.url FROM post_images pi WHERE pi.post_id = p.id ORDER BY pi.sort_order LIMIT 1) AS thumbnail
       FROM posts p
       JOIN users u ON u.id = p.user_id
       JOIN boards b ON b.id = p.board_id
       WHERE p.deleted_at IS NULL
         AND ${windowSql}
         ${viewerFilters}
       ORDER BY score DESC, p.created_at DESC
       LIMIT 20`
    )

    res.json({
      posts: rows.map(r => ({ ...serializePostRow(r), score: r.score })),
      period,
    })
  } catch (err) {
    console.error('[posts:hot]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// GET /api/posts/:id
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const id = parseId(req.params.id)
    if (!id) return res.status(400).json({ error: 'Invalid post id' })
    const [rows] = await pool.query(
      `SELECT p.*, u.name AS author_name, u.avatar_url AS author_avatar, u.suspended_at AS author_suspended_at, ${AUTHOR_TIER_COLUMNS}, b.slug AS board_slug
       FROM posts p
       JOIN users u ON u.id = p.user_id
       JOIN boards b ON b.id = p.board_id
       WHERE p.id = ? AND p.deleted_at IS NULL
       LIMIT 1`,
      [id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Post not found' })
    const row = rows[0]

    // Hide suspended author's post — but owner (self) can still see own content,
    // and admins bypass for moderation.
    if (row.author_suspended_at) {
      const isSelf = req.user && req.user.id === row.user_id
      if (!isSelf) {
        const adminViewer = await isAdminViewer(req)
        if (!adminViewer) return res.status(404).json({ error: 'Post not found' })
      }
    }

    // Released admin notices (admin_notice_at set & is_pinned=0) are gone from
    // the board — nobody can open them via /community/{board}/{id}, not even
    // admins (they manage via /admin/notices instead). The author self is
    // allowed through so they can still see their own history if needed.
    if (row.admin_notice_at && !row.is_pinned) {
      const isSelf = req.user && req.user.id === row.user_id
      if (!isSelf) return res.status(404).json({ error: 'Post not found' })
    }

    // View dedup: owner excluded; logged-in = per-user table (permanent);
    // anonymous = cookie-based 24h window. Plus a short in-memory window that
    // catches double-fires (StrictMode dev rerender, browser prefetch, retry).
    const isOwner = req.user && req.user.id === row.user_id
    let shouldIncrement = false
    if (!isOwner && !recentViewSeen(req, id)) {
      if (req.user) {
        const [result] = await pool.query(
          'INSERT IGNORE INTO post_views (post_id, user_id) VALUES (?, ?)',
          [id, req.user.id]
        )
        shouldIncrement = result.affectedRows > 0
      } else {
        const viewed = parseViewedCookie(req)
        const key = String(id)
        if (!viewed.has(key)) {
          viewed.add(key)
          const arr = Array.from(viewed).slice(-VIEWED_MAX)
          res.cookie(VIEWED_COOKIE, arr.join(','), {
            maxAge: VIEWED_TTL_MS,
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
          })
          shouldIncrement = true
        }
      }
    }
    if (shouldIncrement) {
      pool.query('UPDATE posts SET view_count = view_count + 1 WHERE id = ?', [id])
        .catch(err => console.error('[posts:view]', err.message))
      row.view_count = row.view_count + 1
    }

    const [images] = await pool.query(
      'SELECT url FROM post_images WHERE post_id = ? ORDER BY sort_order',
      [id]
    )

    let myReaction = null
    if (req.user) {
      const [reacts] = await pool.query(
        'SELECT type FROM reactions WHERE post_id = ? AND user_id = ? LIMIT 1',
        [id, req.user.id]
      )
      myReaction = reacts.length ? reacts[0].type : null
    }

    res.json({
      post: {
        ...serializePostRow(row),
        body: row.body,
        images: images.map(i => i.url),
        dislikeCount: row.dislike_count,
        myReaction,
      },
    })
  } catch (err) {
    console.error('[posts:get]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// POST /api/posts { boardSlug, title, body, isPinned? }
// `isPinned` only honored for admin/mod. Read-only boards (is_writable=0)
// are writable by admin/mod (needed for announcement/patch-notes boards).
router.post('/', authMiddleware, requireActive, async (req, res) => {
  try {
    const { boardSlug, title, body, isPinned, subcategory } = req.body || {}
    if (!boardSlug) return res.status(400).json({ error: 'boardSlug required' })
    if (!title || !title.trim()) return res.status(400).json({ error: 'Title required' })
    if (title.length > TITLE_MAX) return res.status(400).json({ error: 'Title too long' })
    if (!body || !body.trim()) return res.status(400).json({ error: 'Body required' })
    if (body.length > BODY_MAX) return res.status(400).json({ error: 'Body too long' })

    const board = await resolveBoard(boardSlug)
    if (!board) return res.status(404).json({ error: 'Board not found' })

    let subcategoryValue = null
    if (hasTabs(board.slug)) {
      if (!subcategory || !isValidTab(board.slug, subcategory)) {
        return res.status(400).json({ error: 'subcategory required for this board' })
      }
      subcategoryValue = subcategory
    }

    // Re-check role from DB (JWT may be stale).
    const [meRows] = await pool.query(
      'SELECT role FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [req.user.id]
    )
    const isAdmin = meRows[0]?.role === 'admin' || meRows[0]?.role === 'mod'

    if (!board.is_writable && !isAdmin) {
      return res.status(403).json({ error: 'Board is read-only' })
    }

    const pinned = isAdmin && isPinned ? 1 : 0
    // admin_notice_at marks admin-authored notices so we can "release" them later
    // (unpin → hide from users but keep for admin records). Only set at CREATE
    // time when an admin publishes with pin=1; never set on later pin toggles.
    const adminNoticeSql = isAdmin && pinned ? 'CURRENT_TIMESTAMP' : 'NULL'

    const conn = await pool.getConnection()
    let postId
    try {
      await conn.beginTransaction()
      const [result] = await conn.query(
        `INSERT INTO posts (board_id, user_id, title, body, subcategory, is_pinned, admin_notice_at)
         VALUES (?, ?, ?, ?, ?, ?, ${adminNoticeSql})`,
        [board.id, req.user.id, title.trim(), body, subcategoryValue, pinned]
      )
      postId = result.insertId

      const thumb = extractFirstImage(body)
      if (thumb) {
        await conn.query(
          'INSERT INTO post_images (post_id, url, sort_order) VALUES (?, ?, 0)',
          [postId, thumb]
        )
      }
      await conn.query(
        'UPDATE users SET post_count = post_count + 1 WHERE id = ?',
        [req.user.id]
      )
      await conn.commit()
    } catch (err) {
      try { await conn.rollback() } catch (_) { /* ignore */ }
      throw err
    } finally {
      conn.release()
    }
    bumpAchievedTier(pool, req.user.id)

    res.json({ id: postId, boardSlug })
  } catch (err) {
    console.error('[posts:create]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// PATCH /api/posts/:id { title?, body?, isPinned?, subcategory? }
// Owner can edit own title/body/subcategory. Admin/mod can edit ANY post and toggle isPinned.
router.patch('/:id', authMiddleware, requireActive, async (req, res) => {
  try {
    const id = parseId(req.params.id)
    if (!id) return res.status(400).json({ error: 'Invalid post id' })
    const { title, body, isPinned, subcategory } = req.body || {}

    const [rows] = await pool.query(
      `SELECT p.user_id, b.slug AS board_slug
       FROM posts p
       JOIN boards b ON b.id = p.board_id
       WHERE p.id = ? AND p.deleted_at IS NULL`,
      [id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Post not found' })

    const boardSlug = rows[0].board_slug
    const isOwner = rows[0].user_id === req.user.id
    let isAdmin = false
    if (!isOwner || isPinned !== undefined) {
      const [meRows] = await pool.query(
        'SELECT role FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1',
        [req.user.id]
      )
      isAdmin = meRows[0]?.role === 'admin' || meRows[0]?.role === 'mod'
    }
    if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Forbidden' })

    const fields = []
    const params = []
    if (title !== undefined) {
      if (!title || !title.trim()) return res.status(400).json({ error: 'Title required' })
      if (title.length > TITLE_MAX) return res.status(400).json({ error: 'Title too long' })
      fields.push('title = ?')
      params.push(title.trim())
    }
    if (body !== undefined) {
      if (!body || !body.trim()) return res.status(400).json({ error: 'Body required' })
      if (body.length > BODY_MAX) return res.status(400).json({ error: 'Body too long' })
      fields.push('body = ?')
      params.push(body)
    }
    if (isPinned !== undefined && isAdmin) {
      fields.push('is_pinned = ?')
      params.push(isPinned ? 1 : 0)
    }
    if (subcategory !== undefined && hasTabs(boardSlug)) {
      if (!isValidTab(boardSlug, subcategory)) {
        return res.status(400).json({ error: 'invalid subcategory for this board' })
      }
      fields.push('subcategory = ?')
      params.push(subcategory)
    }
    if (!fields.length) return res.status(400).json({ error: 'No fields to update' })

    params.push(id)
    await pool.query(`UPDATE posts SET ${fields.join(', ')} WHERE id = ?`, params)

    if (body !== undefined) {
      await pool.query('DELETE FROM post_images WHERE post_id = ?', [id])
      const thumb = extractFirstImage(body)
      if (thumb) {
        await pool.query(
          'INSERT INTO post_images (post_id, url, sort_order) VALUES (?, ?, 0)',
          [id, thumb]
        )
      }
    }

    res.json({ ok: true })
  } catch (err) {
    console.error('[posts:update]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// DELETE /api/posts/:id  (soft delete; owner or admin/mod)
// Owner self-delete: no reason needed, deleted_reason stays NULL.
// Admin/mod moderation: body.reason required → stored in posts.deleted_reason
// for later email notification to the author.
router.delete('/:id', authMiddleware, requireActive, async (req, res) => {
  try {
    const id = parseId(req.params.id)
    if (!id) return res.status(400).json({ error: 'Invalid post id' })
    const [rows] = await pool.query(
      'SELECT user_id FROM posts WHERE id = ? AND deleted_at IS NULL',
      [id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Post not found' })
    const authorId = rows[0].user_id
    const isOwner = authorId === req.user.id
    let reason = null

    if (!isOwner) {
      // Not owner → must be admin/mod. Re-check role from DB (JWT may be stale).
      const [meRows] = await pool.query(
        'SELECT role FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1',
        [req.user.id]
      )
      const role = meRows[0]?.role
      if (role !== 'admin' && role !== 'mod') {
        return res.status(403).json({ error: 'Forbidden' })
      }
      // Moderation delete requires a reason (for audit + email notification later).
      const raw = req.body?.reason
      if (typeof raw !== 'string' || !raw.trim()) {
        return res.status(400).json({ error: 'Reason required' })
      }
      reason = raw.trim().slice(0, 500)
    }

    // Conditional UPDATE prevents double-decrement when two requests
    // (e.g., owner + admin moderation) race on the same post.
    const [delResult] = await pool.query(
      'UPDATE posts SET deleted_at = CURRENT_TIMESTAMP, deleted_reason = ? WHERE id = ? AND deleted_at IS NULL',
      [reason, id]
    )
    if (delResult.affectedRows === 0) {
      return res.json({ ok: true })
    }
    // Decrement the AUTHOR's post count (not necessarily the deleter).
    await pool.query(
      'UPDATE users SET post_count = GREATEST(post_count, 1) - 1 WHERE id = ?',
      [authorId]
    )
    // Moderation delete → notify the author with the admin's reason.
    // Self-delete (reason=null) doesn't send a notification.
    if (!isOwner && reason) {
      sendNotification({
        userId: authorId,
        kind: 'post_deleted',
        title: '게시글이 삭제되었습니다',
        body: `사유: ${reason}`,
      })
    }
    res.json({ ok: true })
  } catch (err) {
    console.error('[posts:delete]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// POST /api/posts/:id/reaction  body: { type: 'like' | 'dislike' }
// Toggle behavior: if user's reaction already equals type → remove; otherwise upsert.
// Like and dislike are mutually exclusive (single row per user per post).
router.post('/:id/reaction', authMiddleware, requireActive, async (req, res) => {
  try {
    const id = parseId(req.params.id)
    if (!id) return res.status(400).json({ error: 'Invalid post id' })

    const type = req.body?.type
    if (type !== 'like' && type !== 'dislike') {
      return res.status(400).json({ error: 'type must be like or dislike' })
    }

    const [posts] = await pool.query(
      'SELECT id FROM posts WHERE id = ? AND deleted_at IS NULL',
      [id]
    )
    if (!posts.length) return res.status(404).json({ error: 'Post not found' })

    const [existing] = await pool.query(
      'SELECT type FROM reactions WHERE post_id = ? AND user_id = ? LIMIT 1',
      [id, req.user.id]
    )
    const current = existing.length ? existing[0].type : null

    let myReaction
    if (current === type) {
      // same click twice → remove
      await pool.query('DELETE FROM reactions WHERE post_id = ? AND user_id = ?', [id, req.user.id])
      myReaction = null
    } else {
      // upsert to the new type
      await pool.query(
        `INSERT INTO reactions (post_id, user_id, type) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE type = VALUES(type), created_at = CURRENT_TIMESTAMP`,
        [id, req.user.id, type]
      )
      myReaction = type
    }

    const counts = await syncReactionCounts(id)
    res.json({ myReaction, ...counts })
  } catch (err) {
    console.error('[posts:reaction]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

module.exports = router
