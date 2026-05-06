// Small helper for creating a user-facing notification from inside other
// route handlers (post moderation delete, user suspend/unsuspend, future
// report/inquiry resolution, etc). Swallows errors so a notification failure
// never breaks the primary action that triggered it.

const { pool } = require('../db')

const KIND_SET = new Set([
  'admin_message',
  'post_deleted',
  'suspended',
  'unsuspended',
  'inquiry_resolved',
  'report_resolved',
  'system',
])

async function sendNotification({ userId, kind, title, body, linkUrl }) {
  if (!userId || !title) return null
  const k = KIND_SET.has(kind) ? kind : 'admin_message'
  try {
    const [result] = await pool.query(
      `INSERT INTO notifications (user_id, kind, title, body, link_url)
       VALUES (?, ?, ?, ?, ?)`,
      [
        userId,
        k,
        String(title).slice(0, 200),
        body ? String(body).slice(0, 1000) : null,
        linkUrl ? String(linkUrl).slice(0, 500) : null,
      ]
    )
    // Keep only 50 most recent per user.
    await pool.query(
      `DELETE FROM notifications WHERE user_id = ? AND id NOT IN (
         SELECT id FROM (
           SELECT id FROM notifications WHERE user_id = ?
           ORDER BY created_at DESC, id DESC LIMIT 50
         ) AS keep
       )`,
      [userId, userId]
    )
    return result.insertId
  } catch (err) {
    console.error('[notify]', err.message)
    return null
  }
}

module.exports = { sendNotification }
