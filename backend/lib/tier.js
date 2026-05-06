// Tier tiers:
//   0 — 신규 (default)
//   1 — 가입 0주 + 글 1 + 댓글 20 + 접속 3
//   2 — 가입 1주 + 글 10 + 댓글 70 + 접속 10
//   3 — 가입 10주 + 글 100 + 댓글 1000 + 접속 150  (일반인 최종)
//   4 — 관리자/모더레이터 (role-based, dynamic)
//
// Sticky tier: once a user reaches tier N, they keep it even if counters drop later
// (users.achieved_tier stores the high-water mark). Tier 4 stays dynamic via role,
// so a demoted admin falls back to their achieved_tier (not stuck at 4).

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000

function weeksSince(date) {
  if (!date) return 0
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return 0
  return Math.floor((Date.now() - d.getTime()) / MS_PER_WEEK)
}

const THRESHOLDS = [
  { tier: 3, weeks: 10, posts: 100, comments: 1000, visits: 150 },
  { tier: 2, weeks: 1, posts: 10, comments: 70, visits: 10 },
  { tier: 1, weeks: 0, posts: 1, comments: 20, visits: 3 },
]

// Pure: tier 0-3 based on current counters alone (no role, no stickiness).
function computeFromCounters(user) {
  if (!user) return 0
  const weeks = weeksSince(user.created_at)
  const pc = user.post_count || 0
  const cc = user.comment_count || 0
  const vc = user.visit_count || 0
  for (const req of THRESHOLDS) {
    if (weeks >= req.weeks && pc >= req.posts && cc >= req.comments && vc >= req.visits) {
      return req.tier
    }
  }
  return 0
}

// What we actually show: admin/mod → 4; else max(current from counters, achieved_tier).
function calcTier(user) {
  if (!user) return 0
  if (user.role === 'admin' || user.role === 'mod') return 4
  const computed = computeFromCounters(user)
  const achieved = user.achieved_tier || 0
  return Math.max(computed, achieved)
}

// Fire-and-forget: after a counter increase (post/comment insert or daily visit),
// re-check if user crossed into a higher tier and persist it. Idempotent.
// `pool` is passed in to avoid importing db.js from a pure lib (keeps tier.js testable).
async function bumpAchievedTier(pool, userId) {
  try {
    const [rows] = await pool.query(
      `SELECT created_at, post_count, comment_count, visit_count, achieved_tier
       FROM users WHERE id = ?`,
      [userId]
    )
    if (!rows.length) return
    const user = rows[0]
    const computed = computeFromCounters(user)
    if (computed > (user.achieved_tier || 0)) {
      await pool.query(
        'UPDATE users SET achieved_tier = ? WHERE id = ? AND achieved_tier < ?',
        [computed, userId, computed]
      )
    }
  } catch (err) {
    console.error('[tier:bump]', err.message)
  }
}

module.exports = { calcTier, computeFromCounters, bumpAchievedTier, THRESHOLDS }
