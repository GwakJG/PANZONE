// /api/admin/* — all routes require admin/mod role.
// Add feature endpoints here (reports queue, featured posts management, user tier edit, etc).

const express = require('express')
const { pool, formatDateOnly } = require('../db')
const { authMiddleware } = require('../middleware/auth')
const { requireAdmin } = require('../middleware/requireAdmin')
const { calcTier } = require('../lib/tier')
const { sendNotification } = require('../lib/notify')

const router = express.Router()

router.use(authMiddleware, requireAdmin)

// Sanity-check endpoint. Returns 200 if caller is admin/mod.
router.get('/ping', (req, res) => {
  res.json({ ok: true, role: req.user.role })
})

// GET /api/admin/dashboard
// One aggregated payload for the admin landing page. Each query is fast (indexed
// or tiny) but we run them in parallel to keep the total request snappy.
router.get('/dashboard', async (req, res) => {
  try {
    const SUSPENSION_GRACE_DAYS = 30
    const queries = [
      // 0 — today signups (non-deleted users created today)
      pool.query(
        `SELECT COUNT(*) AS c FROM users WHERE deleted_at IS NULL AND created_at >= CURDATE()`
      ),
      // 1 — pending reports
      pool.query(`SELECT COUNT(*) AS c FROM reports WHERE status = 'pending'`),
      // 2 — pending inquiries (split by kind for display)
      pool.query(
        `SELECT kind, COUNT(*) AS c FROM inquiries WHERE status = 'pending' GROUP BY kind`
      ),
      // 3 — today new posts (admin notices excluded — they're not organic content)
      pool.query(
        `SELECT COUNT(*) AS c FROM posts
          WHERE deleted_at IS NULL
            AND created_at >= CURDATE()
            AND admin_notice_at IS NULL`
      ),
      // 4 — active admin notices
      pool.query(
        `SELECT COUNT(*) AS c FROM posts
          WHERE deleted_at IS NULL AND is_pinned = 1 AND admin_notice_at IS NOT NULL`
      ),
      // 5 — notice drafts (across all admins)
      pool.query(`SELECT COUNT(*) AS c FROM admin_notice_drafts`),
      // 6 — carousel slots in use
      pool.query(`SELECT COUNT(*) AS c FROM featured_posts WHERE active = 1`),
      // 7 — suspended users in grace window (not yet data-purged)
      pool.query(
        `SELECT COUNT(*) AS c FROM users
          WHERE suspended_at IS NOT NULL
            AND data_purged_at IS NULL
            AND suspended_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
        [SUSPENSION_GRACE_DAYS]
      ),
      // 8 — total users (non-deleted, non-suspended for display purposes)
      pool.query(
        `SELECT COUNT(*) AS c FROM users WHERE deleted_at IS NULL`
      ),
      // 9 — total posts (non-deleted, excludes admin notices from count since they live under /admin/notices)
      pool.query(
        `SELECT COUNT(*) AS c FROM posts WHERE deleted_at IS NULL AND admin_notice_at IS NULL`
      ),
      // 10 — today active users (users whose last_visit_date is today, KST)
      pool.query(
        `SELECT COUNT(*) AS c FROM users WHERE last_visit_date = DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+09:00'))`
      ),
      // 11 — today comments (non-deleted)
      pool.query(
        `SELECT COUNT(*) AS c FROM comments WHERE deleted_at IS NULL AND created_at >= CURDATE()`
      ),
    ]
    const results = await Promise.all(queries)
    const num = i => Number(results[i][0][0]?.c) || 0
    const inquiriesByKind = results[2][0].reduce((acc, row) => {
      acc[row.kind] = Number(row.c) || 0
      return acc
    }, {})
    const pendingInquiries = (inquiriesByKind.suspension_appeal || 0) + (inquiriesByKind.general || 0)

    res.json({
      today: {
        signups: num(0),
        newPosts: num(3),
        activeUsers: num(10),
        comments: num(11),
      },
      pending: {
        reports: num(1),
        inquiries: pendingInquiries,
        inquirySuspensionAppeal: inquiriesByKind.suspension_appeal || 0,
        inquiryGeneral: inquiriesByKind.general || 0,
      },
      notices: {
        active: num(4),
        drafts: num(5),
      },
      carousel: {
        used: num(6),
        max: 10,
      },
      suspension: {
        graceCount: num(7),
        graceDays: SUSPENSION_GRACE_DAYS,
      },
      totals: {
        users: num(8),
        posts: num(9),
      },
    })
  } catch (err) {
    console.error('[admin:dashboard]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

const USER_SORT_COLUMN = {
  date: 'u.created_at',
  name: 'u.name',
  activity: 'u.last_visit_date',
}
const USER_PAGE_SIZES = new Set([20, 40, 60, 100])
const DEFAULT_USER_PAGE_SIZE = 20

// GET /api/admin/users?page=1&pageSize=20&tier=all|0|1|2|3|4&sort=date|name|activity&order=asc|desc
// - Admin/mod are always pinned above regular users (sorted by newest signup within the admin group).
// - Non-admins honor the selected sort+order.
// - Tier filter: 4 → role admin/mod; 0-3 → non-admin AND achieved_tier = N; all → no filter.
router.get('/users', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1)
    let pageSize = parseInt(req.query.pageSize, 10) || DEFAULT_USER_PAGE_SIZE
    if (!USER_PAGE_SIZES.has(pageSize)) pageSize = DEFAULT_USER_PAGE_SIZE
    const offset = (page - 1) * pageSize

    const sortKey = USER_SORT_COLUMN[req.query.sort] ? req.query.sort : 'date'
    const sortCol = USER_SORT_COLUMN[sortKey]
    const order = req.query.order === 'asc' ? 'ASC' : 'DESC'
    // last_visit_date may be NULL for users with no recorded visit; push nulls last regardless of direction.
    const orderClause = sortKey === 'activity'
      ? `${sortCol} IS NULL ASC, ${sortCol} ${order}`
      : `${sortCol} ${order}`

    const tier = req.query.tier
    const q = (req.query.q || '').trim()
    const where = ['u.deleted_at IS NULL']
    const params = []
    if (tier === 'suspended') {
      where.push('u.suspended_at IS NOT NULL')
    } else if (tier === '4') {
      where.push("u.role IN ('admin','mod')")
      where.push('u.suspended_at IS NULL')
    } else if (['0', '1', '2', '3'].includes(tier)) {
      where.push("u.role NOT IN ('admin','mod')")
      where.push('u.suspended_at IS NULL')
      where.push('u.achieved_tier = ?')
      params.push(parseInt(tier, 10))
    }
    if (q) {
      where.push('(u.name LIKE ? OR u.email LIKE ?)')
      const like = `%${q}%`
      params.push(like, like)
    }
    const whereSql = where.join(' AND ')

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM users u WHERE ${whereSql}`,
      params
    )
    const total = countRows[0].total

    const [rows] = await pool.query(
      `SELECT u.id, u.email, u.name, u.role, u.avatar_url, u.created_at,
              u.post_count, u.comment_count, u.visit_count, u.last_visit_date,
              u.achieved_tier, u.suspended_at, u.suspend_reason, u.data_purged_at
       FROM users u
       WHERE ${whereSql}
       ORDER BY
         (CASE WHEN u.role IN ('admin','mod') THEN 0 ELSE 1 END) ASC,
         (CASE WHEN u.role IN ('admin','mod') THEN u.created_at ELSE NULL END) DESC,
         ${orderClause},
         u.id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    )

    res.json({
      users: rows.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        avatarUrl: u.avatar_url || null,
        createdAt: u.created_at instanceof Date ? u.created_at.toISOString() : u.created_at,
        postCount: u.post_count,
        commentCount: u.comment_count,
        visitCount: u.visit_count,
        lastVisitDate: formatDateOnly(u.last_visit_date),
        achievedTier: u.achieved_tier,
        tier: calcTier(u),
        suspended: !!u.suspended_at,
        suspendReason: u.suspend_reason || null,
        suspendedAt: u.suspended_at
          ? (u.suspended_at instanceof Date ? u.suspended_at.toISOString() : u.suspended_at)
          : null,
        dataPurged: !!u.data_purged_at,
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    })
  } catch (err) {
    console.error('[admin:users]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// POST /api/admin/users/:id/suspend  body: { reason }
router.post('/users/:id/suspend', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid user id' })
    if (id === req.user.id) return res.status(400).json({ error: 'Cannot suspend yourself' })

    const rawReason = req.body?.reason
    if (typeof rawReason !== 'string' || !rawReason.trim()) {
      return res.status(400).json({ error: 'Reason required' })
    }
    const reason = rawReason.trim().slice(0, 500)

    const [rows] = await pool.query(
      'SELECT id, role, suspended_at FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [id]
    )
    if (!rows.length) return res.status(404).json({ error: 'User not found' })
    // Prevent suspending admin/mod accidentally; admin can demote first if intended.
    if (rows[0].role === 'admin' || rows[0].role === 'mod') {
      return res.status(400).json({ error: 'Cannot suspend admin/mod; demote role first' })
    }

    await pool.query(
      'UPDATE users SET suspended_at = CURRENT_TIMESTAMP, suspend_reason = ? WHERE id = ?',
      [reason, id]
    )
    sendNotification({
      userId: id,
      kind: 'suspended',
      title: '계정이 정지되었습니다',
      body: `사유: ${reason}\n30일 이내 해제되지 않으면 게시물·프로필 데이터가 영구 파기됩니다. 이의 신청은 프로필의 "문의하기"에서 제출할 수 있습니다.`,
    })
    res.json({ ok: true })
  } catch (err) {
    console.error('[admin:suspend]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// POST /api/admin/users/:id/unsuspend
// Blocked if the user's content was already purged (data_purged_at set).
// Once purged there's nothing to restore — the account is effectively a gravestone.
router.post('/users/:id/unsuspend', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid user id' })
    const [rows] = await pool.query(
      'SELECT data_purged_at FROM users WHERE id = ? LIMIT 1',
      [id]
    )
    if (!rows.length) return res.status(404).json({ error: 'User not found' })
    if (rows[0].data_purged_at) {
      return res.status(400).json({ error: 'Data already purged; cannot unsuspend' })
    }
    await pool.query(
      'UPDATE users SET suspended_at = NULL, suspend_reason = NULL WHERE id = ?',
      [id]
    )
    sendNotification({
      userId: id,
      kind: 'unsuspended',
      title: '정지가 해제되었습니다',
      body: '운영팀이 검토 후 정지를 해제했습니다. 다시 활동하실 수 있습니다.',
    })
    res.json({ ok: true })
  } catch (err) {
    console.error('[admin:unsuspend]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// =====================================================================
// Featured (carousel) management
// =====================================================================
//
// Carousel has at most 10 slots. `display_order` = slot number (1..10),
// always contiguous (1..N where N = number of filled slots). Empty slots
// are virtual positions that don't exist in the DB.
//
// Two item types:
//   - type='post'   → references posts.id (FK)
//   - type='banner' → standalone banner (image + optional link URL + title)
//
// All writes go through a transaction to keep display_order contiguous.

const MAX_FEATURED_SLOTS = 10
const BANNER_TITLE_MAX = 200
const BANNER_URL_MAX = 500

function parseSlotRow(r) {
  if (r.type === 'banner') {
    return {
      featuredId: r.id,
      type: 'banner',
      slot: r.display_order,
      title: r.banner_title || '',
      imageUrl: r.banner_image_url,
      thumbnail: r.banner_image_url,
      linkUrl: r.banner_link_url || null,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    }
  }
  return {
    featuredId: r.id,
    type: 'post',
    slot: r.display_order,
    postId: r.post_id,
    title: r.post_title,
    boardSlug: r.board_slug,
    thumbnail: r.post_thumbnail || null,
    deleted: !!r.post_deleted,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  }
}

function sanitizeBannerTitle(v) {
  return typeof v === 'string' ? v.trim().slice(0, BANNER_TITLE_MAX) : ''
}
function sanitizeBannerUrl(v) {
  if (typeof v !== 'string') return null
  const s = v.trim().slice(0, BANNER_URL_MAX)
  return s || null
}

// GET /api/admin/featured
// Returns ALL slots 1..10 with null for empty slots.
router.get('/featured', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT f.id, f.type, f.display_order, f.active, f.created_at,
              f.post_id,
              f.banner_image_url, f.banner_link_url, f.banner_title,
              p.title AS post_title,
              (p.deleted_at IS NOT NULL) AS post_deleted,
              b.slug AS board_slug,
              (SELECT pi.url FROM post_images pi WHERE pi.post_id = p.id ORDER BY pi.sort_order LIMIT 1) AS post_thumbnail
         FROM featured_posts f
         LEFT JOIN posts p ON p.id = f.post_id
         LEFT JOIN boards b ON b.id = p.board_id
        WHERE f.active = 1
        ORDER BY f.display_order ASC, f.id ASC
        LIMIT ?`,
      [MAX_FEATURED_SLOTS]
    )
    const bySlot = new Map(rows.map(r => [r.display_order, parseSlotRow(r)]))
    const slots = []
    for (let i = 1; i <= MAX_FEATURED_SLOTS; i++) {
      slots.push({ slot: i, item: bySlot.get(i) || null })
    }
    res.json({ slots, maxSlots: MAX_FEATURED_SLOTS })
  } catch (err) {
    console.error('[admin:featured:list]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// Validates a post can be featured; returns { ok, error? }.
async function validatePostForFeature(postId) {
  const id = parseInt(postId, 10)
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, error: 'Invalid postId' }
  const [rows] = await pool.query(
    'SELECT id FROM posts WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [id]
  )
  if (!rows.length) return { ok: false, error: 'Post not found' }
  return { ok: true, id }
}

// Body shape:
//   post   → { type:'post', postId }
//   banner → { type:'banner', imageUrl, linkUrl?, title? }
function validateFeaturedBody(body) {
  const type = body?.type === 'banner' ? 'banner' : body?.type === 'post' ? 'post' : null
  if (!type) return { error: 'Invalid type' }
  if (type === 'post') {
    if (!body.postId) return { error: 'postId required' }
    return { ok: true, type, postId: body.postId }
  }
  const imageUrl = sanitizeBannerUrl(body.imageUrl)
  if (!imageUrl) return { error: 'imageUrl required' }
  return {
    ok: true,
    type,
    imageUrl,
    linkUrl: sanitizeBannerUrl(body.linkUrl),
    title: sanitizeBannerTitle(body.title),
  }
}

// Ensures every active row has display_order 1..N (contiguous, no gaps, no dups).
// Must run inside a transaction. Cheap: at most 2×N UPDATEs where N ≤ 10.
async function compactSlots(conn) {
  const [rows] = await conn.query(
    'SELECT id FROM featured_posts WHERE active = 1 ORDER BY display_order, id'
  )
  // Two-pass to avoid UNIQUE collisions if display_order ever gets one.
  for (let i = 0; i < rows.length; i++) {
    await conn.query(
      'UPDATE featured_posts SET display_order = ? WHERE id = ?',
      [MAX_FEATURED_SLOTS + 100 + i, rows[i].id]
    )
  }
  for (let i = 0; i < rows.length; i++) {
    await conn.query(
      'UPDATE featured_posts SET display_order = ? WHERE id = ?',
      [i + 1, rows[i].id]
    )
  }
  return rows.length
}

// POST /api/admin/featured  (append to first empty slot)
// Errors: 409 SLOT_FULL if 10 slots already occupied, 409 ALREADY_FEATURED if post already pinned.
router.post('/featured', async (req, res) => {
  const parsed = validateFeaturedBody(req.body)
  if (parsed.error) return res.status(400).json({ error: parsed.error })

  let resolvedPostId = null
  if (parsed.type === 'post') {
    const v = await validatePostForFeature(parsed.postId)
    if (!v.ok) return res.status(400).json({ error: v.error })
    resolvedPostId = v.id
  }

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    // Heal any legacy gaps/dups in display_order before computing next slot.
    const count = await compactSlots(conn)
    if (count >= MAX_FEATURED_SLOTS) {
      await conn.rollback()
      return res.status(409).json({ error: 'SLOT_FULL' })
    }
    if (parsed.type === 'post') {
      const [dup] = await conn.query(
        'SELECT id FROM featured_posts WHERE post_id = ? LIMIT 1',
        [resolvedPostId]
      )
      if (dup.length) {
        await conn.rollback()
        return res.status(409).json({ error: 'ALREADY_FEATURED' })
      }
    }
    const nextSlot = count + 1
    if (parsed.type === 'post') {
      await conn.query(
        `INSERT INTO featured_posts (type, post_id, display_order, active)
         VALUES ('post', ?, ?, 1)`,
        [resolvedPostId, nextSlot]
      )
    } else {
      await conn.query(
        `INSERT INTO featured_posts
           (type, post_id, display_order, active, banner_image_url, banner_link_url, banner_title)
         VALUES ('banner', NULL, ?, 1, ?, ?, ?)`,
        [nextSlot, parsed.imageUrl, parsed.linkUrl, parsed.title]
      )
    }
    await conn.commit()
    res.status(201).json({ ok: true, slot: nextSlot })
  } catch (err) {
    await conn.rollback()
    console.error('[admin:featured:create]', err)
    res.status(500).json({ error: 'Internal error' })
  } finally {
    conn.release()
  }
})

// PUT /api/admin/featured/:id  (replace the content of an existing slot; same display_order)
router.put('/featured/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' })
  const parsed = validateFeaturedBody(req.body)
  if (parsed.error) return res.status(400).json({ error: parsed.error })

  let resolvedPostId = null
  if (parsed.type === 'post') {
    const v = await validatePostForFeature(parsed.postId)
    if (!v.ok) return res.status(400).json({ error: v.error })
    resolvedPostId = v.id
  }

  try {
    const [rows] = await pool.query('SELECT id FROM featured_posts WHERE id = ? LIMIT 1', [id])
    if (!rows.length) return res.status(404).json({ error: 'Not found' })

    if (parsed.type === 'post') {
      const [dup] = await pool.query(
        'SELECT id FROM featured_posts WHERE post_id = ? AND id <> ? LIMIT 1',
        [resolvedPostId, id]
      )
      if (dup.length) return res.status(409).json({ error: 'ALREADY_FEATURED' })
      await pool.query(
        `UPDATE featured_posts
            SET type='post', post_id = ?, banner_image_url=NULL, banner_link_url=NULL, banner_title=NULL
          WHERE id = ?`,
        [resolvedPostId, id]
      )
    } else {
      await pool.query(
        `UPDATE featured_posts
            SET type='banner', post_id=NULL,
                banner_image_url = ?, banner_link_url = ?, banner_title = ?
          WHERE id = ?`,
        [parsed.imageUrl, parsed.linkUrl, parsed.title, id]
      )
    }
    res.json({ ok: true })
  } catch (err) {
    console.error('[admin:featured:update]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// DELETE /api/admin/featured/:id  (remove and compact display_order)
router.delete('/featured/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' })

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [rows] = await conn.query(
      'SELECT id FROM featured_posts WHERE id = ? LIMIT 1',
      [id]
    )
    if (!rows.length) {
      await conn.rollback()
      return res.status(404).json({ error: 'Not found' })
    }
    await conn.query('DELETE FROM featured_posts WHERE id = ?', [id])
    await compactSlots(conn)
    await conn.commit()
    res.json({ ok: true })
  } catch (err) {
    await conn.rollback()
    console.error('[admin:featured:delete]', err)
    res.status(500).json({ error: 'Internal error' })
  } finally {
    conn.release()
  }
})

// PATCH /api/admin/featured/reorder  body: { ids: [id1, id2, ...] }
// Assigns display_order 1..N in the input order. Must include every existing featured_posts.id exactly once.
router.patch('/featured/reorder', async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : null
  if (!ids || ids.length === 0) return res.status(400).json({ error: 'ids required' })
  const parsedIds = ids.map(v => parseInt(v, 10))
  if (parsedIds.some(n => !Number.isSafeInteger(n) || n <= 0)) {
    return res.status(400).json({ error: 'Invalid id in ids' })
  }
  if (new Set(parsedIds).size !== parsedIds.length) {
    return res.status(400).json({ error: 'Duplicate ids' })
  }

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [existing] = await conn.query(
      'SELECT id FROM featured_posts ORDER BY id'
    )
    const existingSet = new Set(existing.map(r => r.id))
    if (existing.length !== parsedIds.length || parsedIds.some(id => !existingSet.has(id))) {
      await conn.rollback()
      return res.status(400).json({ error: 'ids must match all existing rows' })
    }
    // Two-pass to avoid UNIQUE KEY collisions on display_order if we ever add one later.
    // (No unique on display_order today, but future-proof.)
    for (let i = 0; i < parsedIds.length; i++) {
      await conn.query(
        'UPDATE featured_posts SET display_order = ? WHERE id = ?',
        [MAX_FEATURED_SLOTS + 100 + i, parsedIds[i]]
      )
    }
    for (let i = 0; i < parsedIds.length; i++) {
      await conn.query(
        'UPDATE featured_posts SET display_order = ? WHERE id = ?',
        [i + 1, parsedIds[i]]
      )
    }
    await conn.commit()
    res.json({ ok: true })
  } catch (err) {
    await conn.rollback()
    console.error('[admin:featured:reorder]', err)
    res.status(500).json({ error: 'Internal error' })
  } finally {
    conn.release()
  }
})

// =====================================================================
// Announcement posts listing (for carousel tab bottom — 공지글 탭)
// =====================================================================
//
// Returns posts from boards with board_type='announcement' (notice / patch / event).
// Each row includes `isFeatured` so the UI can highlight already-featured posts.

const NOTICE_SORT_COLUMN = {
  date: 'p.created_at',
  title: 'p.title',
}
const NOTICE_PAGE_SIZES = new Set([20, 40, 60, 100])
const DEFAULT_NOTICE_PAGE_SIZE = 20

// GET /api/admin/boards?includeData=1
// Lists every board that can carry posts. By default `data` 보드(reference 성격)는
// 제외되지만, 관리자 글 탭처럼 data 보드의 글도 캐러셀에 등록할 수 있는 화면에서는
// `?includeData=1` 로 호출해서 전체 보드를 받음.
router.get('/boards', async (req, res) => {
  try {
    const includeData = req.query.includeData === '1' || req.query.includeData === 'true'
    const where = includeData ? '1=1' : "board_type <> 'data'"
    const [rows] = await pool.query(
      `SELECT slug, name_ko, name_en, board_type
         FROM boards
        WHERE ${where}
        ORDER BY group_order ASC, sort_order ASC, id ASC`
    )
    res.json({
      boards: rows.map(b => ({
        slug: b.slug,
        name: b.name_ko,
        nameEn: b.name_en,
        type: b.board_type,
      })),
    })
  } catch (err) {
    console.error('[admin:boards]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// GET /api/admin/notices?board=all|<slug>&page=&pageSize=&sort=&order=&q=
// Any board is selectable (not just announcement-type). New boards auto-apply.
router.get('/notices', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1)
    let pageSize = parseInt(req.query.pageSize, 10) || DEFAULT_NOTICE_PAGE_SIZE
    if (!NOTICE_PAGE_SIZES.has(pageSize)) pageSize = DEFAULT_NOTICE_PAGE_SIZE
    const offset = (page - 1) * pageSize

    const sortKey = NOTICE_SORT_COLUMN[req.query.sort] ? req.query.sort : 'date'
    const sortCol = NOTICE_SORT_COLUMN[sortKey]
    const order = req.query.order === 'asc' ? 'ASC' : 'DESC'

    const board = req.query.board
    const status = req.query.status
    // Default: all pinned posts (used by the carousel picker).
    // status='active'   → admin-authored active notices (is_pinned=1 & admin_notice_at)
    // status='released' → admin-authored released notices (is_pinned=0 & admin_notice_at)
    // status='all'      → admin-authored any state (admin_notice_at IS NOT NULL)
    const where = ["b.board_type <> 'data'", 'p.deleted_at IS NULL']
    const params = []
    if (status === 'active') {
      where.push('p.admin_notice_at IS NOT NULL AND p.is_pinned = 1')
    } else if (status === 'released') {
      where.push('p.admin_notice_at IS NOT NULL AND p.is_pinned = 0')
    } else if (status === 'all') {
      where.push('p.admin_notice_at IS NOT NULL')
    } else {
      where.push('p.is_pinned = 1')
    }
    if (board === 'favorite') {
      where.push('p.admin_favorite = 1')
    } else if (board && board !== 'all') {
      where.push('b.slug = ?')
      params.push(board)
    }
    const q = (req.query.q || '').trim()
    if (q) {
      where.push('p.title LIKE ?')
      params.push(`%${q}%`)
    }
    const whereSql = where.join(' AND ')

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
         FROM posts p
         JOIN boards b ON b.id = p.board_id
        WHERE ${whereSql}`,
      params
    )
    const total = countRows[0].total

    const [rows] = await pool.query(
      `SELECT p.id, p.title, p.view_count, p.comment_count, p.created_at,
              p.admin_favorite, p.is_pinned, p.admin_notice_at,
              b.slug AS board_slug, b.name_ko AS board_name_ko,
              u.name AS author_name,
              (SELECT pi.url FROM post_images pi WHERE pi.post_id = p.id ORDER BY pi.sort_order LIMIT 1) AS thumbnail,
              f.id AS featured_id,
              f.display_order AS featured_order
         FROM posts p
         JOIN boards b ON b.id = p.board_id
         JOIN users u ON u.id = p.user_id
         LEFT JOIN featured_posts f ON f.post_id = p.id AND f.active = 1
        WHERE ${whereSql}
        ORDER BY (f.id IS NULL) ASC, f.display_order ASC,
                 ${sortCol} ${order}, p.id DESC
        LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    )

    res.json({
      posts: rows.map(p => ({
        id: p.id,
        title: p.title,
        boardSlug: p.board_slug,
        boardName: p.board_name_ko,
        author: p.author_name,
        views: p.view_count,
        commentCount: p.comment_count,
        thumbnail: p.thumbnail || null,
        date: p.created_at instanceof Date ? p.created_at.toISOString() : p.created_at,
        isFeatured: !!p.featured_id,
        featuredId: p.featured_id || null,
        featuredOrder: p.featured_order || null,
        isFavorite: !!p.admin_favorite,
        adminNoticeAt: p.admin_notice_at
          ? (p.admin_notice_at instanceof Date ? p.admin_notice_at.toISOString() : p.admin_notice_at)
          : null,
        released: !!p.admin_notice_at && !p.is_pinned,
        pinned: !!p.is_pinned,
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    })
  } catch (err) {
    console.error('[admin:notices]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// GET /api/admin/admin-posts?board=all|<slug>&page=&pageSize=&sort=&order=&q=
// Admin/mod 가 작성한 비-공지 글 목록 (캐러셀 등록 "관리자 글" 탭).
// 공지글 탭과 겹치지 않도록 is_pinned=0 AND admin_notice_at IS NULL 적용.
router.get('/admin-posts', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1)
    let pageSize = parseInt(req.query.pageSize, 10) || DEFAULT_NOTICE_PAGE_SIZE
    if (!NOTICE_PAGE_SIZES.has(pageSize)) pageSize = DEFAULT_NOTICE_PAGE_SIZE
    const offset = (page - 1) * pageSize

    const sortKey = NOTICE_SORT_COLUMN[req.query.sort] ? req.query.sort : 'date'
    const sortCol = NOTICE_SORT_COLUMN[sortKey]
    const order = req.query.order === 'asc' ? 'ASC' : 'DESC'

    const board = req.query.board
    // admin-posts 탭은 data 보드(확률형 아이템 등)도 포함 — admin 작성 글이면 다 노출.
    const where = [
      'p.deleted_at IS NULL',
      'p.is_pinned = 0',
      'p.admin_notice_at IS NULL',
      "u.role IN ('admin','mod')",
    ]
    const params = []
    if (board === 'favorite') {
      where.push('p.admin_favorite = 1')
    } else if (board && board !== 'all') {
      where.push('b.slug = ?')
      params.push(board)
    }
    const q = (req.query.q || '').trim()
    if (q) {
      where.push('p.title LIKE ?')
      params.push(`%${q}%`)
    }
    const whereSql = where.join(' AND ')

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
         FROM posts p
         JOIN boards b ON b.id = p.board_id
         JOIN users u ON u.id = p.user_id
        WHERE ${whereSql}`,
      params
    )
    const total = countRows[0].total

    const [rows] = await pool.query(
      `SELECT p.id, p.title, p.view_count, p.comment_count, p.created_at,
              p.admin_favorite, p.is_pinned, p.admin_notice_at,
              b.slug AS board_slug, b.name_ko AS board_name_ko,
              u.name AS author_name,
              (SELECT pi.url FROM post_images pi WHERE pi.post_id = p.id ORDER BY pi.sort_order LIMIT 1) AS thumbnail,
              f.id AS featured_id,
              f.display_order AS featured_order
         FROM posts p
         JOIN boards b ON b.id = p.board_id
         JOIN users u ON u.id = p.user_id
         LEFT JOIN featured_posts f ON f.post_id = p.id AND f.active = 1
        WHERE ${whereSql}
        ORDER BY (f.id IS NULL) ASC, f.display_order ASC,
                 ${sortCol} ${order}, p.id DESC
        LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    )

    res.json({
      posts: rows.map(p => ({
        id: p.id,
        title: p.title,
        boardSlug: p.board_slug,
        boardName: p.board_name_ko,
        author: p.author_name,
        views: p.view_count,
        commentCount: p.comment_count,
        thumbnail: p.thumbnail || null,
        date: p.created_at instanceof Date ? p.created_at.toISOString() : p.created_at,
        isFeatured: !!p.featured_id,
        featuredId: p.featured_id || null,
        featuredOrder: p.featured_order || null,
        isFavorite: !!p.admin_favorite,
        adminNoticeAt: null,
        released: false,
        pinned: false,
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    })
  } catch (err) {
    console.error('[admin:admin-posts]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// PATCH /api/admin/notices/:id/favorite  body: { favorite: boolean }
// Admin-only flag; shared across all admins, not scoped to the caller.
router.patch('/notices/:id/favorite', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' })
  const favorite = req.body?.favorite ? 1 : 0
  try {
    const [result] = await pool.query(
      'UPDATE posts SET admin_favorite = ? WHERE id = ? AND deleted_at IS NULL',
      [favorite, id]
    )
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Post not found' })
    res.json({ ok: true, favorite: !!favorite })
  } catch (err) {
    console.error('[admin:notice:favorite]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// =====================================================================
// Notice drafts (임시저장)
// =====================================================================
//
// Separate from `posts` — a draft carries title/body/boardSlugs until the
// admin decides to publish (which creates actual posts via the broadcast
// endpoint). Drafts are scoped to their author (user_id) so admins don't
// see each other's unfinished work.

const DRAFT_TITLE_MAX = 200
const DRAFT_BODY_MAX = 200 * 1024

function parseBoardSlugs(raw) {
  if (Array.isArray(raw)) {
    return raw.filter(s => typeof s === 'string' && s.length > 0 && s.length < 60)
  }
  return []
}

function serializeDraft(row) {
  let slugs = row.board_slugs
  if (typeof slugs === 'string') { try { slugs = JSON.parse(slugs) } catch { slugs = [] } }
  return {
    id: row.id,
    title: row.title || '',
    body: row.body || '',
    boardSlugs: Array.isArray(slugs) ? slugs : [],
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  }
}

// GET /api/admin/notice-drafts
router.get('/notice-drafts', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, title, body, board_slugs, created_at, updated_at
         FROM admin_notice_drafts
        WHERE user_id = ?
        ORDER BY updated_at DESC, id DESC`,
      [req.user.id]
    )
    res.json({ drafts: rows.map(serializeDraft) })
  } catch (err) {
    console.error('[admin:drafts:list]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// GET /api/admin/notice-drafts/:id
router.get('/notice-drafts/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' })
  try {
    const [rows] = await pool.query(
      `SELECT id, title, body, board_slugs, created_at, updated_at
         FROM admin_notice_drafts
        WHERE id = ? AND user_id = ? LIMIT 1`,
      [id, req.user.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Draft not found' })
    res.json({ draft: serializeDraft(rows[0]) })
  } catch (err) {
    console.error('[admin:drafts:get]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// POST /api/admin/notice-drafts  body: { title, body, boardSlugs }
router.post('/notice-drafts', async (req, res) => {
  const { title, body, boardSlugs } = req.body || {}
  const t = typeof title === 'string' ? title.slice(0, DRAFT_TITLE_MAX) : ''
  const b = typeof body === 'string' ? body.slice(0, DRAFT_BODY_MAX) : ''
  const slugs = parseBoardSlugs(boardSlugs)
  if (!slugs.length) return res.status(400).json({ error: 'boardSlugs required' })
  try {
    const [result] = await pool.query(
      `INSERT INTO admin_notice_drafts (user_id, title, body, board_slugs) VALUES (?, ?, ?, ?)`,
      [req.user.id, t, b, JSON.stringify(slugs)]
    )
    res.status(201).json({ id: result.insertId })
  } catch (err) {
    console.error('[admin:drafts:create]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// PUT /api/admin/notice-drafts/:id  body: { title, body, boardSlugs }
router.put('/notice-drafts/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' })
  const { title, body, boardSlugs } = req.body || {}
  const t = typeof title === 'string' ? title.slice(0, DRAFT_TITLE_MAX) : ''
  const b = typeof body === 'string' ? body.slice(0, DRAFT_BODY_MAX) : ''
  const slugs = parseBoardSlugs(boardSlugs)
  if (!slugs.length) return res.status(400).json({ error: 'boardSlugs required' })
  try {
    const [result] = await pool.query(
      `UPDATE admin_notice_drafts SET title = ?, body = ?, board_slugs = ?
        WHERE id = ? AND user_id = ?`,
      [t, b, JSON.stringify(slugs), id, req.user.id]
    )
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Draft not found' })
    res.json({ ok: true })
  } catch (err) {
    console.error('[admin:drafts:update]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// DELETE /api/admin/notice-drafts/:id
router.delete('/notice-drafts/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' })
  try {
    const [result] = await pool.query(
      'DELETE FROM admin_notice_drafts WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    )
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Draft not found' })
    res.json({ ok: true })
  } catch (err) {
    console.error('[admin:drafts:delete]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// POST /api/admin/notices/broadcast  body: { boardSlugs: [slug,...], title, body, isPinned }
// Creates the same notice on every selected board. All posts share identical
// title/body/isPinned + get admin_notice_at set. If any INSERT fails, the whole
// batch rolls back so admins don't end up with a half-published notice.
router.post('/notices/broadcast', async (req, res) => {
  const { boardSlugs, title, body, isPinned } = req.body || {}
  if (!Array.isArray(boardSlugs) || !boardSlugs.length) {
    return res.status(400).json({ error: 'boardSlugs required' })
  }
  if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'Title required' })
  if (title.length > 40) return res.status(400).json({ error: 'Title too long' })
  if (typeof body !== 'string' || !body.trim()) return res.status(400).json({ error: 'Body required' })

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [boards] = await conn.query(
      `SELECT id, slug FROM boards WHERE slug IN (${boardSlugs.map(() => '?').join(',')})`,
      boardSlugs
    )
    if (boards.length !== boardSlugs.length) {
      await conn.rollback()
      return res.status(400).json({ error: 'Unknown board in boardSlugs' })
    }
    const pinned = isPinned ? 1 : 0
    const adminNoticeSql = pinned ? 'CURRENT_TIMESTAMP' : 'NULL'
    const created = []
    for (const b of boards) {
      const [r] = await conn.query(
        `INSERT INTO posts (board_id, user_id, title, body, is_pinned, admin_notice_at)
         VALUES (?, ?, ?, ?, ?, ${adminNoticeSql})`,
        [b.id, req.user.id, title.trim(), body, pinned]
      )
      created.push({ id: r.insertId, boardSlug: b.slug })
      // Extract and store the first image so list thumbnails work (same logic as posts.js POST).
      const m = body.match(/<img[^>]+src=["']([^"']+)["']/i)
      if (m && m[1] && m[1].length <= 500) {
        await conn.query(
          'INSERT INTO post_images (post_id, url, sort_order) VALUES (?, ?, 0)',
          [r.insertId, m[1]]
        )
      }
    }
    // Single post_count bump reflecting the full batch.
    await conn.query(
      'UPDATE users SET post_count = post_count + ? WHERE id = ?',
      [boards.length, req.user.id]
    )
    await conn.commit()
    res.status(201).json({ created })
  } catch (err) {
    await conn.rollback()
    console.error('[admin:notices:broadcast]', err)
    res.status(500).json({ error: 'Internal error' })
  } finally {
    conn.release()
  }
})

// DELETE /api/admin/notices/:id
// Dedicated admin-scoped delete for notices: soft-delete, no reason, no email
// notification (it's admin content, deleted by admin — the moderation-delete
// flow on /api/posts/:id is for moderating *other people's* posts).
router.delete('/notices/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' })
  try {
    const [rows] = await pool.query(
      'SELECT user_id FROM posts WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Post not found' })
    await pool.query(
      'UPDATE posts SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    )
    await pool.query(
      'UPDATE users SET post_count = GREATEST(post_count, 1) - 1 WHERE id = ?',
      [rows[0].user_id]
    )
    res.json({ ok: true })
  } catch (err) {
    console.error('[admin:notice:delete]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// PATCH /api/admin/notices/:id/pin  body: { pinned: boolean }
// Toggle the is_pinned flag on any post. This is the "공지 지정/해제" action;
// pinned posts are what show up in the admin 공지글 탭 and the carousel picker.
router.patch('/notices/:id/pin', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' })
  const pinned = req.body?.pinned ? 1 : 0
  try {
    const [result] = await pool.query(
      'UPDATE posts SET is_pinned = ? WHERE id = ? AND deleted_at IS NULL',
      [pinned, id]
    )
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Post not found' })
    res.json({ ok: true, pinned: !!pinned })
  } catch (err) {
    console.error('[admin:notice:pin]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// =====================================================================
// Reports queue — user-submitted reports with admin resolution flow
// =====================================================================
//
// Admin handles reports *after* already performing any post-delete / user-suspend
// actions manually. Resolve just flips status to 'resolved' (+ optional note).
// We join target (post or comment) + target author + parent post for URL +
// reporter info in a single query so the page renders from one payload.

const REPORT_SORT_COLUMN = { date: 'r.created_at' }
const REPORT_PAGE_SIZES = new Set([20, 40, 60, 100])
const DEFAULT_REPORT_PAGE_SIZE = 20
const REPORT_STATUS_FILTERS = new Set(['all', 'pending', 'resolved'])
const REPORT_REASON_CODES = new Set([
  'spam', 'abuse', 'adult', 'privacy', 'fake', 'inappropriate', 'other',
])
const RESOLVE_NOTE_MAX = 500

function parseJsonArray(v) {
  if (!v) return []
  if (Array.isArray(v)) return v
  if (typeof v === 'string') {
    try {
      const p = JSON.parse(v)
      return Array.isArray(p) ? p : []
    } catch { return [] }
  }
  return []
}

function clipSnippet(s, n = 200) {
  if (!s) return ''
  // Strip HTML-ish tags so post bodies (rich text) show as plain text in the
  // admin table. Conservative — just removes angle-bracket tags.
  const plain = String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return plain.length > n ? plain.slice(0, n) + '…' : plain
}

// GET /api/admin/reports?status=&code=&q=&sort=&order=&page=&pageSize=
router.get('/reports', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1)
    let pageSize = parseInt(req.query.pageSize, 10) || DEFAULT_REPORT_PAGE_SIZE
    if (!REPORT_PAGE_SIZES.has(pageSize)) pageSize = DEFAULT_REPORT_PAGE_SIZE
    const offset = (page - 1) * pageSize

    const sortKey = REPORT_SORT_COLUMN[req.query.sort] ? req.query.sort : 'date'
    const sortCol = REPORT_SORT_COLUMN[sortKey]
    const order = req.query.order === 'asc' ? 'ASC' : 'DESC'

    const status = REPORT_STATUS_FILTERS.has(req.query.status) ? req.query.status : 'all'
    const code = REPORT_REASON_CODES.has(req.query.code) ? req.query.code : null
    const q = (req.query.q || '').trim()

    const where = []
    const params = []
    if (status === 'pending') where.push("r.status = 'pending'")
    else if (status === 'resolved') where.push("r.status IN ('resolved','dismissed')")
    // 'all' → no predicate.
    if (code) {
      // reason_codes is a JSON array; JSON_CONTAINS returns 1 if the scalar is in the array.
      where.push('JSON_CONTAINS(r.reason_codes, JSON_QUOTE(?))')
      params.push(code)
    }
    if (q) {
      where.push(
        '(reporter.name LIKE ? OR r.reason LIKE ? OR p.title LIKE ? OR p.body LIKE ? OR c.body LIKE ?)'
      )
      const like = `%${q}%`
      params.push(like, like, like, like, like)
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const joinSql = `
      FROM reports r
      LEFT JOIN users reporter ON reporter.id = r.reporter_user_id
      LEFT JOIN posts p ON r.target_type = 'post' AND p.id = r.target_id
      LEFT JOIN comments c ON r.target_type = 'comment' AND c.id = r.target_id
      LEFT JOIN posts cp ON r.target_type = 'comment' AND cp.id = c.post_id
      LEFT JOIN boards b ON b.id = COALESCE(p.board_id, cp.board_id)
      LEFT JOIN users author ON author.id = COALESCE(p.user_id, c.user_id)
      LEFT JOIN users resolver ON resolver.id = r.resolver_user_id
    `

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total ${joinSql} ${whereSql}`,
      params
    )
    const total = countRows[0].total

    const [rows] = await pool.query(
      `SELECT
         r.id, r.target_type, r.target_id, r.reason, r.reason_codes, r.image_urls,
         r.status, r.created_at, r.resolved_at, r.resolve_note, r.resolve_action, r.admin_memo,
         reporter.id        AS reporter_id,
         reporter.name      AS reporter_name,
         reporter.avatar_url AS reporter_avatar,
         author.id          AS author_id,
         author.name        AS author_name,
         author.avatar_url  AS author_avatar,
         (author.suspended_at IS NOT NULL) AS author_suspended,
         p.title            AS post_title,
         p.body             AS post_body,
         (p.deleted_at IS NOT NULL) AS post_deleted,
         c.body             AS comment_body,
         (c.deleted_at IS NOT NULL) AS comment_deleted,
         cp.id              AS comment_post_id,
         cp.title           AS comment_post_title,
         b.slug             AS board_slug,
         b.name_ko          AS board_name,
         resolver.name      AS resolver_name,
         (SELECT COUNT(*) FROM reports r2
            WHERE r2.target_type = r.target_type AND r2.target_id = r.target_id) AS dup_count
       ${joinSql}
       ${whereSql}
       ORDER BY ${sortCol} ${order}, r.id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    )

    res.json({
      reports: rows.map(r => {
        const isPost = r.target_type === 'post'
        const postIdForUrl = isPost ? r.target_id : r.comment_post_id
        const targetUrl = r.board_slug && postIdForUrl
          ? (isPost
              ? `/community/${r.board_slug}/${postIdForUrl}`
              : `/community/${r.board_slug}/${postIdForUrl}#comment-${r.target_id}`)
          : null
        return {
          id: r.id,
          targetType: r.target_type,
          targetId: r.target_id,
          targetUrl,
          targetTitle: isPost ? (r.post_title || '') : (r.comment_post_title || ''),
          targetSnippet: clipSnippet(isPost ? r.post_body : r.comment_body),
          targetDeleted: isPost ? !!r.post_deleted : !!r.comment_deleted,
          boardSlug: r.board_slug || null,
          boardName: r.board_name || null,
          reason: r.reason || '',
          reasonCodes: parseJsonArray(r.reason_codes),
          imageUrls: parseJsonArray(r.image_urls),
          status: r.status,
          createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
          resolvedAt: r.resolved_at
            ? (r.resolved_at instanceof Date ? r.resolved_at.toISOString() : r.resolved_at)
            : null,
          resolveNote: r.resolve_note || null,
          resolveAction: r.resolve_action || null,
          resolverName: r.resolver_name || null,
          adminMemo: r.admin_memo || '',
          duplicateCount: Number(r.dup_count) || 0,
          reporter: r.reporter_id ? {
            id: r.reporter_id,
            name: r.reporter_name,
            avatarUrl: r.reporter_avatar || null,
          } : null,
          reportee: r.author_id ? {
            id: r.author_id,
            name: r.author_name,
            avatarUrl: r.author_avatar || null,
            suspended: !!r.author_suspended,
          } : null,
        }
      }),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    })
  } catch (err) {
    console.error('[admin:reports:list]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// PATCH /api/admin/reports/:id/resolve  body: { action, message }
//
// Admin already performed any real deletion/suspension manually; this call
// records the action type, saves the user-visible message, flips status, and
// notifies the right party:
//   post_delete / comment_delete / suspend → reportee (the reported user)
//   no_offense                              → reporter
// Message is the exact text the user will see (modal pre-fills a template
// with {nickname} substituted, admin may edit before submit).
const RESOLVE_ACTIONS = new Set(['post_delete', 'comment_delete', 'suspend', 'no_offense'])
const RESOLVE_ACTION_KIND = {
  post_delete: 'post_deleted',
  comment_delete: 'post_deleted',
  suspend: 'suspended',
  no_offense: 'report_resolved',
}
const RESOLVE_ACTION_TITLE = {
  post_delete: '게시글이 삭제되었습니다',
  comment_delete: '댓글이 삭제되었습니다',
  suspend: '계정이 정지되었습니다',
  no_offense: '신고하신 내용 검토 결과',
}

router.patch('/reports/:id/resolve', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' })

  const action = req.body?.action
  if (!RESOLVE_ACTIONS.has(action)) return res.status(400).json({ error: 'Invalid action' })

  const rawMsg = req.body?.message
  if (typeof rawMsg !== 'string' || !rawMsg.trim()) {
    return res.status(400).json({ error: 'message required' })
  }
  const message = rawMsg.trim().slice(0, RESOLVE_NOTE_MAX)

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    // Need reporter/reportee ids + target state so the right side-effect runs
    // and the correct recipient gets the notification.
    const [rows] = await conn.query(
      `SELECT r.reporter_user_id, r.target_type, r.target_id,
              p.user_id       AS post_author_id,
              p.deleted_at    AS post_deleted_at,
              c.user_id       AS comment_author_id,
              c.post_id       AS comment_post_id,
              c.parent_id     AS comment_parent_id,
              c.deleted_at    AS comment_deleted_at,
              cp.user_id      AS comment_post_owner_id,
              reportee.role   AS reportee_role,
              reportee.suspended_at AS reportee_suspended_at
         FROM reports r
         LEFT JOIN posts    p ON r.target_type = 'post'    AND p.id = r.target_id
         LEFT JOIN comments c ON r.target_type = 'comment' AND c.id = r.target_id
         LEFT JOIN posts    cp ON r.target_type = 'comment' AND cp.id = c.post_id
         LEFT JOIN users reportee ON reportee.id = COALESCE(p.user_id, c.user_id)
        WHERE r.id = ? LIMIT 1`,
      [id]
    )
    if (!rows.length) {
      await conn.rollback()
      return res.status(404).json({ error: 'Report not found' })
    }
    const row = rows[0]
    const reporteeId = row.target_type === 'post' ? row.post_author_id : row.comment_author_id

    // Reject obvious action/target mismatches early (the UI defaults match the
    // target, but the radio lets the admin pick anything — guard server-side).
    if (action === 'post_delete' && row.target_type !== 'post') {
      await conn.rollback()
      return res.status(400).json({ error: '글삭제는 게시글 신고에만 사용할 수 있습니다' })
    }
    if (action === 'comment_delete' && row.target_type !== 'comment') {
      await conn.rollback()
      return res.status(400).json({ error: '댓글 삭제는 댓글 신고에만 사용할 수 있습니다' })
    }
    if ((action === 'suspend' || action === 'post_delete' || action === 'comment_delete') && !reporteeId) {
      await conn.rollback()
      return res.status(400).json({ error: '대상 유저/콘텐츠가 이미 없거나 확인되지 않습니다' })
    }
    if (action === 'suspend' && (row.reportee_role === 'admin' || row.reportee_role === 'mod')) {
      await conn.rollback()
      return res.status(400).json({ error: '관리자 계정은 정지할 수 없습니다' })
    }

    // Perform the side-effect. Each branch is idempotent: re-running on an
    // already-deleted post / suspended user is a no-op, so admins can click
    // 처리하기 a second time after a transient error without double-effect.
    if (action === 'post_delete' && !row.post_deleted_at) {
      await conn.query(
        'UPDATE posts SET deleted_at = CURRENT_TIMESTAMP, deleted_reason = ? WHERE id = ?',
        [message, row.target_id]
      )
      await conn.query(
        'UPDATE users SET post_count = GREATEST(post_count, 1) - 1 WHERE id = ?',
        [reporteeId]
      )
    } else if (action === 'comment_delete' && !row.comment_deleted_at) {
      await conn.query(
        'UPDATE comments SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?',
        [row.target_id]
      )
      // Mirrors the own-delete endpoint: top-level comments on own posts
      // don't increment user.comment_count at creation time, so they also
      // don't decrement here.
      const wasCounted = !(row.comment_post_owner_id === reporteeId && row.comment_parent_id === null)
      if (wasCounted) {
        await conn.query(
          'UPDATE users SET comment_count = GREATEST(comment_count, 1) - 1 WHERE id = ?',
          [reporteeId]
        )
      }
    } else if (action === 'suspend' && !row.reportee_suspended_at) {
      await conn.query(
        'UPDATE users SET suspended_at = CURRENT_TIMESTAMP, suspend_reason = ? WHERE id = ?',
        [message, reporteeId]
      )
    }
    // no_offense → no operational side-effect; notification only.

    await conn.query(
      `UPDATE reports
          SET status = 'resolved',
              resolved_at = CURRENT_TIMESTAMP,
              resolver_user_id = ?,
              resolve_note = ?,
              resolve_action = ?
        WHERE id = ?`,
      [req.user.id, message, action, id]
    )

    await conn.commit()

    // Notification outside the transaction — sendNotification swallows errors,
    // and we don't want a notify failure to roll back the resolve.
    const recipientId = action === 'no_offense' ? row.reporter_user_id : reporteeId
    if (recipientId) {
      sendNotification({
        userId: recipientId,
        kind: RESOLVE_ACTION_KIND[action],
        title: RESOLVE_ACTION_TITLE[action],
        body: message,
      })
    }

    res.json({ ok: true })
  } catch (err) {
    await conn.rollback()
    console.error('[admin:reports:resolve]', err)
    res.status(500).json({ error: 'Internal error' })
  } finally {
    conn.release()
  }
})

// PATCH /api/admin/reports/:id/memo  body: { memo }
// Admin-only shared memo (비고). Pass an empty string to clear.
const ADMIN_MEMO_MAX = 1000
router.patch('/reports/:id/memo', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' })
  const raw = req.body?.memo
  const memo = typeof raw === 'string' ? raw.slice(0, ADMIN_MEMO_MAX) : ''
  try {
    const [result] = await pool.query(
      'UPDATE reports SET admin_memo = ? WHERE id = ?',
      [memo.trim() ? memo : null, id]
    )
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Report not found' })
    res.json({ ok: true, memo: memo.trim() ? memo : '' })
  } catch (err) {
    console.error('[admin:reports:memo]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// PATCH /api/admin/reports/:id/reopen  (undo resolve in case of mistake)
router.patch('/reports/:id/reopen', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' })
  try {
    const [result] = await pool.query(
      `UPDATE reports
          SET status = 'pending',
              resolved_at = NULL,
              resolver_user_id = NULL,
              resolve_note = NULL,
              resolve_action = NULL
        WHERE id = ?`,
      [id]
    )
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Report not found' })
    res.json({ ok: true })
  } catch (err) {
    console.error('[admin:reports:reopen]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// =====================================================================
// Inquiries queue — user-submitted inquiries (정지 이의 + 일반) with
// admin resolution flow. Mirrors the reports queue shape so the frontend
// patterns transfer cleanly.
// =====================================================================

const INQUIRY_SORT_COLUMN = { date: 'i.created_at' }
const INQUIRY_PAGE_SIZES = new Set([20, 40, 60, 100])
const DEFAULT_INQUIRY_PAGE_SIZE = 20
const INQUIRY_STATUS_FILTERS = new Set(['all', 'pending', 'resolved'])
const INQUIRY_KIND_FILTERS = new Set(['all', 'suspension_appeal', 'general'])
const INQUIRY_RESOLVE_NOTE_MAX = 1000
const INQUIRY_ADMIN_MEMO_MAX = 1000

const INQUIRY_ACTIONS = new Set(['unsuspend', 'reject_appeal', 'reply', 'close_unanswered'])
// Notification kind per action. close_unanswered sends no notification at all.
const INQUIRY_ACTION_KIND = {
  unsuspend: 'unsuspended',
  reject_appeal: 'inquiry_resolved',
  reply: 'inquiry_resolved',
}
const INQUIRY_ACTION_TITLE = {
  unsuspend: '계정 정지가 해제되었습니다',
  reject_appeal: '이의 신청이 기각되었습니다',
  reply: '문의에 답변드렸습니다',
}
// Which action is valid for which kind (UI also guards, but validate server-side).
const INQUIRY_ACTION_KIND_MAP = {
  unsuspend: 'suspension_appeal',
  reject_appeal: 'suspension_appeal',
  reply: 'general',
  close_unanswered: 'general',
}

// GET /api/admin/inquiries?status=&kind=&q=&sort=&order=&page=&pageSize=
router.get('/inquiries', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1)
    let pageSize = parseInt(req.query.pageSize, 10) || DEFAULT_INQUIRY_PAGE_SIZE
    if (!INQUIRY_PAGE_SIZES.has(pageSize)) pageSize = DEFAULT_INQUIRY_PAGE_SIZE
    const offset = (page - 1) * pageSize

    const sortKey = INQUIRY_SORT_COLUMN[req.query.sort] ? req.query.sort : 'date'
    const sortCol = INQUIRY_SORT_COLUMN[sortKey]
    const order = req.query.order === 'asc' ? 'ASC' : 'DESC'

    const status = INQUIRY_STATUS_FILTERS.has(req.query.status) ? req.query.status : 'all'
    const kind = INQUIRY_KIND_FILTERS.has(req.query.kind) ? req.query.kind : 'all'
    const q = (req.query.q || '').trim()

    const where = []
    const params = []
    if (status === 'pending') where.push("i.status = 'pending'")
    else if (status === 'resolved') where.push("i.status = 'resolved'")
    if (kind !== 'all') {
      where.push('i.kind = ?')
      params.push(kind)
    }
    if (q) {
      where.push('(u.name LIKE ? OR u.email LIKE ? OR i.message LIKE ?)')
      const like = `%${q}%`
      params.push(like, like, like)
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const joinSql = `
      FROM inquiries i
      LEFT JOIN users u ON u.id = i.user_id
      LEFT JOIN users resolver ON resolver.id = i.resolver_user_id
    `

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total ${joinSql} ${whereSql}`,
      params
    )
    const total = countRows[0].total

    const [rows] = await pool.query(
      `SELECT
         i.id, i.kind, i.message, i.image_urls, i.status,
         i.created_at, i.resolved_at, i.resolve_note, i.resolve_action, i.admin_memo,
         u.id AS user_id, u.name AS user_name, u.email AS user_email,
         u.avatar_url AS user_avatar,
         (u.suspended_at IS NOT NULL) AS user_suspended,
         resolver.name AS resolver_name
       ${joinSql}
       ${whereSql}
       ORDER BY ${sortCol} ${order}, i.id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    )

    res.json({
      inquiries: rows.map(r => ({
        id: r.id,
        kind: r.kind,
        message: r.message || '',
        imageUrls: parseJsonArray(r.image_urls),
        status: r.status,
        createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
        resolvedAt: r.resolved_at
          ? (r.resolved_at instanceof Date ? r.resolved_at.toISOString() : r.resolved_at)
          : null,
        resolveNote: r.resolve_note || null,
        resolveAction: r.resolve_action || null,
        resolverName: r.resolver_name || null,
        adminMemo: r.admin_memo || '',
        user: r.user_id ? {
          id: r.user_id,
          name: r.user_name,
          email: r.user_email,
          avatarUrl: r.user_avatar || null,
          suspended: !!r.user_suspended,
        } : null,
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    })
  } catch (err) {
    console.error('[admin:inquiries:list]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// PATCH /api/admin/inquiries/:id/resolve  body: { action, message? }
// `message` is the user-facing reply (required EXCEPT for close_unanswered).
// Performs the real side-effect (unsuspend) when action=unsuspend, then
// notifies the inquirer with the admin's reply.
router.patch('/inquiries/:id/resolve', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' })

  const action = req.body?.action
  if (!INQUIRY_ACTIONS.has(action)) return res.status(400).json({ error: 'Invalid action' })

  const rawMsg = req.body?.message
  const messageRequired = action !== 'close_unanswered'
  if (messageRequired && (typeof rawMsg !== 'string' || !rawMsg.trim())) {
    return res.status(400).json({ error: 'message required' })
  }
  const message = (typeof rawMsg === 'string' && rawMsg.trim())
    ? rawMsg.trim().slice(0, INQUIRY_RESOLVE_NOTE_MAX)
    : null

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    const [rows] = await conn.query(
      `SELECT i.user_id, i.kind,
              u.suspended_at AS user_suspended_at, u.data_purged_at,
              u.role AS user_role
         FROM inquiries i
         LEFT JOIN users u ON u.id = i.user_id
        WHERE i.id = ? LIMIT 1`,
      [id]
    )
    if (!rows.length) {
      await conn.rollback()
      return res.status(404).json({ error: 'Inquiry not found' })
    }
    const row = rows[0]

    const requiredKind = INQUIRY_ACTION_KIND_MAP[action]
    if (requiredKind !== row.kind) {
      await conn.rollback()
      return res.status(400).json({ error: '문의 종류와 맞지 않는 액션입니다' })
    }

    if (action === 'unsuspend') {
      if (!row.user_id) {
        await conn.rollback()
        return res.status(400).json({ error: '유저 정보가 확인되지 않습니다' })
      }
      if (row.data_purged_at) {
        await conn.rollback()
        return res.status(400).json({ error: '이미 데이터가 파기된 계정입니다' })
      }
      if (row.user_suspended_at) {
        // Real unsuspend — mirrors /admin/users/:id/unsuspend SQL but without
        // its default notification (we send our own with the admin's reply).
        await conn.query(
          'UPDATE users SET suspended_at = NULL, suspend_reason = NULL WHERE id = ?',
          [row.user_id]
        )
      }
      // If already unsuspended, fall through — just record the resolution.
    }

    await conn.query(
      `UPDATE inquiries
          SET status = 'resolved',
              resolved_at = CURRENT_TIMESTAMP,
              resolver_user_id = ?,
              resolve_note = ?,
              resolve_action = ?
        WHERE id = ?`,
      [req.user.id, message, action, id]
    )

    await conn.commit()

    // Notification outside the transaction. close_unanswered deliberately
    // skips the notification (admin chose to close silently).
    const kindKey = INQUIRY_ACTION_KIND[action]
    if (kindKey && row.user_id && message) {
      sendNotification({
        userId: row.user_id,
        kind: kindKey,
        title: INQUIRY_ACTION_TITLE[action],
        body: message,
      })
    }

    res.json({ ok: true })
  } catch (err) {
    await conn.rollback()
    console.error('[admin:inquiries:resolve]', err)
    res.status(500).json({ error: 'Internal error' })
  } finally {
    conn.release()
  }
})

// PATCH /api/admin/inquiries/:id/reopen
// Resets the inquiry row to pending. Does NOT re-suspend the user (manual).
router.patch('/inquiries/:id/reopen', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' })
  try {
    const [result] = await pool.query(
      `UPDATE inquiries
          SET status = 'pending',
              resolved_at = NULL,
              resolver_user_id = NULL,
              resolve_note = NULL,
              resolve_action = NULL
        WHERE id = ?`,
      [id]
    )
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Inquiry not found' })
    res.json({ ok: true })
  } catch (err) {
    console.error('[admin:inquiries:reopen]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// PATCH /api/admin/inquiries/:id/memo  body: { memo }
router.patch('/inquiries/:id/memo', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' })
  const raw = req.body?.memo
  const memo = typeof raw === 'string' ? raw.slice(0, INQUIRY_ADMIN_MEMO_MAX) : ''
  try {
    const [result] = await pool.query(
      'UPDATE inquiries SET admin_memo = ? WHERE id = ?',
      [memo.trim() ? memo : null, id]
    )
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Inquiry not found' })
    res.json({ ok: true, memo: memo.trim() ? memo : '' })
  } catch (err) {
    console.error('[admin:inquiries:memo]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// =====================================================================
// Notification templates — shared "자주하는 답변" library
// =====================================================================

const TEMPLATE_TITLE_MAX = 200
const TEMPLATE_BODY_MAX = 1000

function serializeTemplate(r) {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    creatorId: r.creator_id,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at,
  }
}

router.get('/notification-templates', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, creator_id, title, body, created_at, updated_at
         FROM notification_templates
        ORDER BY updated_at DESC, id DESC`
    )
    res.json({ templates: rows.map(serializeTemplate) })
  } catch (err) {
    console.error('[admin:templates:list]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

router.post('/notification-templates', async (req, res) => {
  const { title, body } = req.body || {}
  if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'title required' })
  if (typeof body !== 'string' || !body.trim()) return res.status(400).json({ error: 'body required' })
  try {
    const [result] = await pool.query(
      `INSERT INTO notification_templates (creator_id, title, body) VALUES (?, ?, ?)`,
      [req.user.id, title.trim().slice(0, TEMPLATE_TITLE_MAX), body.trim().slice(0, TEMPLATE_BODY_MAX)]
    )
    res.status(201).json({ id: result.insertId })
  } catch (err) {
    console.error('[admin:templates:create]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

router.put('/notification-templates/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' })
  const { title, body } = req.body || {}
  if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'title required' })
  if (typeof body !== 'string' || !body.trim()) return res.status(400).json({ error: 'body required' })
  try {
    const [result] = await pool.query(
      `UPDATE notification_templates SET title = ?, body = ? WHERE id = ?`,
      [title.trim().slice(0, TEMPLATE_TITLE_MAX), body.trim().slice(0, TEMPLATE_BODY_MAX), id]
    )
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' })
    res.json({ ok: true })
  } catch (err) {
    console.error('[admin:templates:update]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

router.delete('/notification-templates/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' })
  try {
    const [result] = await pool.query(
      `DELETE FROM notification_templates WHERE id = ?`,
      [id]
    )
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' })
    res.json({ ok: true })
  } catch (err) {
    console.error('[admin:templates:delete]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// =====================================================================
// Bulk / broadcast notifications (used by 다중 전송 / 전체 전송)
// =====================================================================

async function insertNotifications(rows) {
  if (!rows.length) return 0
  // One INSERT ... VALUES (...), (...), ... for efficiency.
  const placeholders = rows.map(() => '(?, ?, ?, ?, ?)').join(', ')
  const params = rows.flatMap(r => [r.user_id, r.kind, r.title, r.body, r.link_url])
  await pool.query(
    `INSERT INTO notifications (user_id, kind, title, body, link_url) VALUES ${placeholders}`,
    params
  )
  // Enforce the 50-per-user cap on every recipient that just got a new row.
  const uniqueUsers = Array.from(new Set(rows.map(r => r.user_id)))
  for (const uid of uniqueUsers) {
    await pool.query(
      `DELETE FROM notifications WHERE user_id = ? AND id NOT IN (
         SELECT id FROM (
           SELECT id FROM notifications WHERE user_id = ?
           ORDER BY created_at DESC, id DESC LIMIT 50
         ) AS keep
       )`,
      [uid, uid]
    )
  }
  return rows.length
}

// POST /api/admin/notifications/bulk  body: { userIds: [...], title, body?, kind?, linkUrl? }
router.post('/notifications/bulk', async (req, res) => {
  const { userIds, title, body, kind, linkUrl } = req.body || {}
  if (!Array.isArray(userIds) || !userIds.length) return res.status(400).json({ error: 'userIds required' })
  if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'title required' })
  const allowedKinds = ['admin_message', 'post_deleted', 'suspended', 'unsuspended', 'inquiry_resolved', 'report_resolved', 'system']
  const k = allowedKinds.includes(kind) ? kind : 'admin_message'
  try {
    // Filter to valid non-deleted users.
    const ids = userIds.map(n => parseInt(n, 10)).filter(n => Number.isSafeInteger(n) && n > 0)
    if (!ids.length) return res.status(400).json({ error: 'No valid userIds' })
    const [valid] = await pool.query(
      `SELECT id FROM users WHERE deleted_at IS NULL AND id IN (${ids.map(() => '?').join(',')})`,
      ids
    )
    const validIds = valid.map(r => r.id)
    const rows = validIds.map(uid => ({
      user_id: uid,
      kind: k,
      title: title.trim().slice(0, 200),
      body: body ? String(body).slice(0, 1000) : null,
      link_url: linkUrl ? String(linkUrl).slice(0, 500) : null,
    }))
    const count = await insertNotifications(rows)
    res.status(201).json({ count })
  } catch (err) {
    console.error('[admin:notifications:bulk]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// POST /api/admin/notifications/broadcast
//   body: { title, body?, kind?, linkUrl?, filter?: { tier?, q? } }
// Sends to every non-admin/mod user that isn't deleted. When `filter` is
// provided, applies the same tier / search predicates the admin sees in the
// users list UI so "필터 전체 전송" matches the visible cohort.
router.post('/notifications/broadcast', async (req, res) => {
  const { title, body, kind, linkUrl, filter } = req.body || {}
  if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'title required' })
  const allowedKinds = ['admin_message', 'post_deleted', 'suspended', 'unsuspended', 'inquiry_resolved', 'report_resolved', 'system']
  const k = allowedKinds.includes(kind) ? kind : 'admin_message'
  try {
    const where = ['deleted_at IS NULL']
    const params = []
    const tier = filter?.tier
    if (tier === 'suspended') {
      where.push('suspended_at IS NOT NULL')
    } else if (tier === '4') {
      where.push("role IN ('admin','mod')")
      where.push('suspended_at IS NULL')
    } else if (['0', '1', '2', '3'].includes(tier)) {
      where.push("role NOT IN ('admin','mod')")
      where.push('suspended_at IS NULL')
      where.push('achieved_tier = ?')
      params.push(parseInt(tier, 10))
    } else {
      // Default (no filter or tier='all'): broadcast to regular active users.
      where.push('suspended_at IS NULL')
      where.push("role NOT IN ('admin','mod')")
    }
    const q = typeof filter?.q === 'string' ? filter.q.trim() : ''
    if (q) {
      where.push('(name LIKE ? OR email LIKE ?)')
      const like = `%${q}%`
      params.push(like, like)
    }
    const [users] = await pool.query(
      `SELECT id FROM users WHERE ${where.join(' AND ')}`,
      params
    )
    const rows = users.map(u => ({
      user_id: u.id,
      kind: k,
      title: title.trim().slice(0, 200),
      body: body ? String(body).slice(0, 1000) : null,
      link_url: linkUrl ? String(linkUrl).slice(0, 500) : null,
    }))
    const count = await insertNotifications(rows)
    res.status(201).json({ count })
  } catch (err) {
    console.error('[admin:notifications:broadcast]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// POST /api/admin/notifications  body: { userId, kind?, title, body?, linkUrl? }
// Sends an in-app notification to a specific user. This is the replacement for
// the email channel in MVP — used by the 신고/문의 tabs (once built) and by
// any free-form "admin message" flow.
router.post('/notifications', async (req, res) => {
  const { userId, kind, title, body, linkUrl } = req.body || {}
  const uid = parseInt(userId, 10)
  if (!Number.isSafeInteger(uid) || uid <= 0) return res.status(400).json({ error: 'userId required' })
  if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'title required' })
  const allowedKinds = ['admin_message', 'post_deleted', 'suspended', 'unsuspended', 'inquiry_resolved', 'report_resolved', 'system']
  const k = allowedKinds.includes(kind) ? kind : 'admin_message'
  try {
    const [userRows] = await pool.query('SELECT id FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1', [uid])
    if (!userRows.length) return res.status(404).json({ error: 'User not found' })
    const [result] = await pool.query(
      `INSERT INTO notifications (user_id, kind, title, body, link_url)
       VALUES (?, ?, ?, ?, ?)`,
      [uid, k, title.trim().slice(0, 200), body ? String(body).slice(0, 1000) : null, linkUrl ? String(linkUrl).slice(0, 500) : null]
    )
    // Cap per-user history at 50 — anything older than the 50th most recent is purged.
    await pool.query(
      `DELETE FROM notifications WHERE user_id = ? AND id NOT IN (
         SELECT id FROM (
           SELECT id FROM notifications
           WHERE user_id = ?
           ORDER BY created_at DESC, id DESC
           LIMIT 50
         ) AS keep
       )`,
      [uid, uid]
    )
    res.status(201).json({ id: result.insertId })
  } catch (err) {
    console.error('[admin:notifications:send]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

module.exports = router
