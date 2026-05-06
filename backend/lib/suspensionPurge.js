// Data retention policy for suspended accounts.
//
// Timeline after suspension:
//   Day 0..30  → content fully visible to admin, hidden from public. Unsuspend allowed.
//   Day 30+    → purge: soft-delete posts/comments, null out avatar/bio/counters.
//                users row stays (email + nickname remain locked from re-registration).
//                Unsuspend blocked (there's nothing to restore).
//
// Safe to run repeatedly: skips users whose data_purged_at is already set.

const { pool } = require('../db')

const RETENTION_DAYS = 30
const PURGE_REASON = '정지 만료로 인한 데이터 삭제'

async function purgeOneUser(userId) {
  // Soft-delete posts with a machine-readable reason so admin can still see they existed.
  await pool.query(
    `UPDATE posts
     SET deleted_at = CURRENT_TIMESTAMP, deleted_reason = ?
     WHERE user_id = ? AND deleted_at IS NULL`,
    [PURGE_REASON, userId]
  )
  // Soft-delete comments (tombstone preserves thread shape).
  await pool.query(
    `UPDATE comments
     SET deleted_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND deleted_at IS NULL`,
    [userId]
  )
  // Clear personal identifiers that aren't needed for the lock.
  // Keep: email, name, password_hash (email/name lock re-registration).
  await pool.query(
    `UPDATE users
     SET avatar_url = NULL,
         bio = NULL,
         post_count = 0,
         comment_count = 0,
         data_purged_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [userId]
  )
}

async function runSuspensionPurge() {
  const [rows] = await pool.query(
    `SELECT id FROM users
     WHERE suspended_at IS NOT NULL
       AND data_purged_at IS NULL
       AND suspended_at < NOW() - INTERVAL ? DAY`,
    [RETENTION_DAYS]
  )
  let purged = 0
  for (const r of rows) {
    try {
      await purgeOneUser(r.id)
      purged++
    } catch (err) {
      console.error('[suspension:purge]', r.id, err.message)
    }
  }
  return { purged, candidates: rows.length }
}

module.exports = { runSuspensionPurge, RETENTION_DAYS }
