// /api/notifications/* — user-facing endpoints for reading and acknowledging
// notifications that admins (or system events) have pushed to this account.

const express = require('express')
const { pool } = require('../db')
const { authMiddleware } = require('../middleware/auth')

const router = express.Router()

function serialize(row) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    linkUrl: row.link_url,
    read: !!row.read_at,
    readAt: row.read_at instanceof Date ? row.read_at.toISOString() : row.read_at,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  }
}

// GET /api/notifications?page=1&pageSize=20
// Returns the caller's own notifications, newest first, plus the total unread
// count so the bell badge stays accurate even when the dropdown is paginated.
router.get('/', authMiddleware, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1)
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize, 10) || 20))
    const offset = (page - 1) * pageSize

    const [rows] = await pool.query(
      `SELECT id, kind, title, body, link_url, read_at, created_at
         FROM notifications
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT ? OFFSET ?`,
      [req.user.id, pageSize, offset]
    )
    const [unreadRows] = await pool.query(
      `SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL`,
      [req.user.id]
    )
    const [totalRows] = await pool.query(
      `SELECT COUNT(*) AS c FROM notifications WHERE user_id = ?`,
      [req.user.id]
    )
    res.json({
      notifications: rows.map(serialize),
      unreadCount: Number(unreadRows[0].c) || 0,
      totalCount: Number(totalRows[0].c) || 0,
      page,
      pageSize,
    })
  } catch (err) {
    console.error('[notifications:list]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// GET /api/notifications/:id/page?pageSize=20
// Returns which page (1-based) a given notification sits on, assuming the
// same "ORDER BY created_at DESC, id DESC" we use everywhere. Lets the profile
// page deep-link and auto-scroll to a notification clicked from the header bell.
router.get('/:id/page', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' })
  const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize, 10) || 20))
  try {
    const [targetRows] = await pool.query(
      'SELECT id, created_at FROM notifications WHERE id = ? AND user_id = ? LIMIT 1',
      [id, req.user.id]
    )
    if (!targetRows.length) return res.status(404).json({ error: 'Not found' })
    const t = targetRows[0]
    const [[{ rowsBefore }]] = await pool.query(
      `SELECT COUNT(*) AS rowsBefore FROM notifications
        WHERE user_id = ?
          AND (created_at > ? OR (created_at = ? AND id > ?))`,
      [req.user.id, t.created_at, t.created_at, t.id]
    )
    const page = Math.floor(Number(rowsBefore) / pageSize) + 1
    res.json({ page, pageSize })
  } catch (err) {
    console.error('[notifications:page]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// GET /api/notifications/ids
// Returns every notification id for the caller, newest first. Used by the
// profile's "모든 알림 선택" feature so bulk actions can span across pages.
router.get('/ids', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC`,
      [req.user.id]
    )
    res.json({ ids: rows.map(r => r.id) })
  } catch (err) {
    console.error('[notifications:ids]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// GET /api/notifications/unread-count
// Cheap endpoint for polling the bell badge without fetching the full list.
router.get('/unread-count', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL`,
      [req.user.id]
    )
    res.json({ unreadCount: Number(rows[0].c) || 0 })
  } catch (err) {
    console.error('[notifications:unread]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// POST /api/notifications/:id/read
router.post('/:id/read', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' })
  try {
    const [result] = await pool.query(
      `UPDATE notifications SET read_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ? AND read_at IS NULL`,
      [id, req.user.id]
    )
    res.json({ ok: true, changed: result.affectedRows > 0 })
  } catch (err) {
    console.error('[notifications:read]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// DELETE /api/notifications/:id  (owner delete — hard delete)
router.delete('/:id', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' })
  try {
    await pool.query(
      'DELETE FROM notifications WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    )
    res.json({ ok: true })
  } catch (err) {
    console.error('[notifications:delete]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// POST /api/notifications/read-all
router.post('/read-all', authMiddleware, async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET read_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND read_at IS NULL`,
      [req.user.id]
    )
    res.json({ ok: true })
  } catch (err) {
    console.error('[notifications:read-all]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

module.exports = router
