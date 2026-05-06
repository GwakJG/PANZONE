// Sync PUBG official events into the `event` board.
//
// Usage:
//   node backend/scripts/sync_pubg_events.js                  # progress events only (default)
//   node backend/scripts/sync_pubg_events.js --period both    # progress + recently completed
//   node backend/scripts/sync_pubg_events.js --period complete
//   node backend/scripts/sync_pubg_events.js --dry            # preview only
//   node backend/scripts/sync_pubg_events.js --keep-removed   # don't delete events that left the upstream list
//
// Same upsert pattern as the probability sync:
//   - new pubg_post_id  → INSERT
//   - same id           → body UPDATE (event period/details may change)
//   - missing from feed → DELETE (event ended and dropped off PUBG's "in-progress" list)

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const { pool, runMigrations } = require('../db')
const { fetchAllEvents, fetchEventBodyHtml, sanitize, DETAIL_URL } = require('../lib/pubgEvents')

function parseArgs(argv) {
  const out = { period: 'PROGRESS', dry: false, keepRemoved: false }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--dry') out.dry = true
    else if (argv[i] === '--keep-removed') out.keepRemoved = true
    else if (argv[i] === '--period') {
      const v = String(argv[++i] || '').toUpperCase()
      out.period = v === 'BOTH' ? 'BOTH' : (v === 'COMPLETE' ? 'COMPLETE' : 'PROGRESS')
    }
  }
  return out
}

async function pickAdminUserId() {
  const [rows] = await pool.query(
    "SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL ORDER BY id ASC LIMIT 1"
  )
  if (!rows.length) throw new Error('No admin user found.')
  return rows[0].id
}

async function getEventBoardId() {
  const [rows] = await pool.query("SELECT id FROM boards WHERE slug = 'event' LIMIT 1")
  if (!rows.length) throw new Error("`event` board not found.")
  return rows[0].id
}

async function loadExistingMap() {
  const [rows] = await pool.query('SELECT pubg_post_id, post_id FROM pubg_event_imports')
  const m = new Map()
  for (const r of rows) m.set(Number(r.pubg_post_id), Number(r.post_id))
  return m
}

function toMysqlDateTime(d) {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
         `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
}

function buildBody(rawHtml, meta) {
  const cleaned = sanitize(rawHtml)
  const period = (meta.startTime && meta.endTime)
    ? `<p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">기간: ${meta.startTime} ~ ${meta.endTime}</p>`
    : ''
  const footer = `\n<p style="margin-top:24px;font-size:12px;color:var(--text-secondary);">출처: <a href="${DETAIL_URL(meta.postId)}" target="_blank" rel="noopener">PUBG 공식 이벤트 페이지</a></p>`
  return `${period}${cleaned}${footer}`.trim()
}

function extractFirstImage(html) {
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i)
  if (!m) return null
  return m[1].length <= 500 ? m[1] : null
}

async function gatherEvents(period) {
  if (period === 'BOTH') {
    const a = await fetchAllEvents({ period: 'PROGRESS' })
    const b = await fetchAllEvents({ period: 'COMPLETE' })
    // dedupe by postId
    const map = new Map()
    for (const x of [...a, ...b]) map.set(x.postId, x)
    return [...map.values()]
  }
  return fetchAllEvents({ period })
}

async function main() {
  const args = parseArgs(process.argv)
  console.log(`[event-sync] period=${args.period} dry=${args.dry}`)
  await runMigrations()

  const events = await gatherEvents(args.period)
  console.log(`[event-sync] ${events.length} event(s) on PUBG feed`)
  // Oldest startTime first → newer events get higher post ids.
  events.sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)))

  if (args.dry) {
    for (const e of events) {
      console.log(`  [dry] postId=${e.postId} ${e.startTime} ~ ${e.endTime}  ${e.title}`)
    }
    await pool.end()
    return
  }

  const [adminId, boardId, existing] = await Promise.all([
    pickAdminUserId(),
    getEventBoardId(),
    loadExistingMap(),
  ])

  const seen = new Set()
  let inserted = 0, updated = 0, removed = 0, failed = 0

  for (const e of events) {
    seen.add(e.postId)

    let bodyHtml
    try {
      bodyHtml = await fetchEventBodyHtml(e.postId)
    } catch (err) {
      failed++
      console.warn(`  [!] postId=${e.postId} body fetch failed: ${err.message}`)
      continue
    }
    const fullBody = buildBody(bodyHtml, e)
    const thumb = (e.images?.[0]?.thumbUrl || e.images?.[0]?.imageUrl || extractFirstImage(fullBody)) || null
    const existingPostId = existing.get(e.postId)

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      if (existingPostId) {
        await conn.query(
          'UPDATE posts SET title = ?, body = ? WHERE id = ?',
          [e.title, fullBody, existingPostId]
        )
        await conn.query('DELETE FROM post_images WHERE post_id = ?', [existingPostId])
        if (thumb) {
          await conn.query(
            'INSERT INTO post_images (post_id, url, sort_order) VALUES (?, ?, 0)',
            [existingPostId, thumb]
          )
        }
        updated++
        console.log(`  [~] post=${existingPostId} pubgId=${e.postId} ${e.title}`)
      } else {
        // Use the event's actual displayStartTime for created_at so the board
        // sort order matches PUBG's chronology.
        const createdAt = e.displayStartTime
          ? toMysqlDateTime(new Date(e.displayStartTime.replace(' ', 'T') + 'Z'))
          : null
        const [r] = await conn.query(
          createdAt
            ? `INSERT INTO posts (board_id, user_id, title, body, is_pinned, created_at, updated_at)
               VALUES (?, ?, ?, ?, 0, ?, ?)`
            : `INSERT INTO posts (board_id, user_id, title, body, is_pinned, created_at, updated_at)
               VALUES (?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          createdAt
            ? [boardId, adminId, e.title, fullBody, createdAt, createdAt]
            : [boardId, adminId, e.title, fullBody]
        )
        const postId = r.insertId
        if (thumb) {
          await conn.query(
            'INSERT INTO post_images (post_id, url, sort_order) VALUES (?, ?, 0)',
            [postId, thumb]
          )
        }
        await conn.query(
          'INSERT INTO pubg_event_imports (pubg_post_id, post_id, source_url) VALUES (?, ?, ?)',
          [e.postId, postId, DETAIL_URL(e.postId)]
        )
        inserted++
        console.log(`  [+] post=${postId} pubgId=${e.postId} ${e.title}`)
      }
      await conn.commit()
    } catch (err) {
      await conn.rollback()
      failed++
      console.error(`  [!] postId=${e.postId} db failed: ${err.message}`)
    } finally {
      conn.release()
    }
  }

  if (!args.keepRemoved) {
    for (const [pubgId, postId] of existing) {
      if (seen.has(pubgId)) continue
      try {
        await pool.query('DELETE FROM posts WHERE id = ?', [postId])
        removed++
        console.log(`  [-] post=${postId} pubgId=${pubgId} (no longer on PUBG feed)`)
      } catch (err) {
        console.error(`  [!] delete post=${postId} failed: ${err.message}`)
      }
    }
  }

  console.log(`[event-sync] done. inserted=${inserted} updated=${updated} removed=${removed} failed=${failed}`)
  await pool.end()
}

main().catch(err => { console.error(err); process.exit(1) })
