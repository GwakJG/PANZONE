// Sync PUBG official "확률형 아이템 정보 공개" page into the `loot` board as
// one post per crate. Re-run weekly to refresh.
//
// Each <h2> section on pubg.com/ko/game-info/probability becomes its own post.
// The crate name (h2 text) is the stable key, so subsequent runs:
//   - update the body of crates that still exist
//   - insert new crates that appeared (new event boxes)
//   - delete posts for crates that disappeared from the page
//
// Usage:
//   node backend/scripts/sync_pubg_probability.js          # fetch + upsert
//   node backend/scripts/sync_pubg_probability.js --dry    # preview only
//   node backend/scripts/sync_pubg_probability.js --keep-removed  # don't delete vanished crates

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const { pool, runMigrations } = require('../db')
const { fetchProbabilityCrates, PROBABILITY_URL } = require('../lib/pubgProbability')

// 모든 확률형 아이템 글 본문 상단에 들어갈 공통 커버 이미지.
// `public/item_images.webp` → Vite가 정적 root로 서빙하므로 `/item_images.webp` 로 접근.
const COVER_IMAGE_URL = '/item_images.webp'
const COVER_IMAGE_HTML =
  `<p style="margin:0 0 16px;">` +
  `<img src="${COVER_IMAGE_URL}" alt="확률형 아이템" ` +
  `style="width:100%;max-width:720px;display:block;border-radius:8px;" />` +
  `</p>\n`

function extractFirstImage(html) {
  if (!html) return null
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i)
  if (!m) return null
  return m[1].length <= 500 ? m[1] : null
}

function parseArgs(argv) {
  const out = { dry: false, keepRemoved: false }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--dry') out.dry = true
    else if (argv[i] === '--keep-removed') out.keepRemoved = true
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

async function getLootBoardId() {
  const [rows] = await pool.query("SELECT id FROM boards WHERE slug = 'loot' LIMIT 1")
  if (!rows.length) throw new Error("`loot` board not found.")
  return rows[0].id
}

async function loadExistingMap() {
  const [rows] = await pool.query('SELECT crate_key, post_id FROM pubg_probability_imports')
  const m = new Map()
  for (const r of rows) m.set(r.crate_key, r.post_id)
  return m
}

function buildBody(html) {
  return (
    COVER_IMAGE_HTML +
    html +
    `\n<p style="margin-top:24px;font-size:12px;color:var(--text-secondary);">출처: <a href="${PROBABILITY_URL}" target="_blank" rel="noopener">PUBG 공식 확률 공개 페이지</a></p>`
  )
}

async function syncPostThumbnail(conn, postId, body) {
  await conn.query('DELETE FROM post_images WHERE post_id = ?', [postId])
  const thumb = extractFirstImage(body)
  if (thumb) {
    await conn.query(
      'INSERT INTO post_images (post_id, url, sort_order) VALUES (?, ?, 0)',
      [postId, thumb]
    )
  }
}

async function main() {
  const args = parseArgs(process.argv)
  console.log(`[prob-sync] fetching ${PROBABILITY_URL}`)
  await runMigrations()

  const crates = await fetchProbabilityCrates()
  console.log(`[prob-sync] ${crates.length} crate sections found`)

  if (args.dry) {
    for (const c of crates) {
      console.log(`  [dry] ${c.key}  (body=${c.html.length}b)`)
    }
    await pool.end()
    return
  }

  const [adminId, boardId, existing] = await Promise.all([
    pickAdminUserId(),
    getLootBoardId(),
    loadExistingMap(),
  ])

  const seenKeys = new Set()
  let inserted = 0, updated = 0

  for (const crate of crates) {
    seenKeys.add(crate.key)
    const body = buildBody(crate.html)
    const existingPostId = existing.get(crate.key)

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      if (existingPostId) {
        await conn.query(
          'UPDATE posts SET title = ?, body = ? WHERE id = ?',
          [crate.title, body, existingPostId]
        )
        await syncPostThumbnail(conn, existingPostId, body)
        updated++
        console.log(`  [~] post=${existingPostId}  ${crate.title}  (body=${body.length}b)`)
      } else {
        const [r] = await conn.query(
          `INSERT INTO posts (board_id, user_id, title, body, is_pinned, created_at, updated_at)
           VALUES (?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [boardId, adminId, crate.title, body]
        )
        const postId = r.insertId
        await conn.query(
          'INSERT INTO pubg_probability_imports (crate_key, post_id, source_url) VALUES (?, ?, ?)',
          [crate.key, postId, PROBABILITY_URL]
        )
        await syncPostThumbnail(conn, postId, body)
        inserted++
        console.log(`  [+] post=${postId}  ${crate.title}  (body=${body.length}b)`)
      }
      await conn.commit()
    } catch (err) {
      await conn.rollback()
      console.error(`  [!] ${crate.title} failed: ${err.message}`)
    } finally {
      conn.release()
    }
  }

  // Crates that vanished from the upstream page (removed/expired event box).
  let removed = 0
  if (!args.keepRemoved) {
    for (const [key, postId] of existing) {
      if (seenKeys.has(key)) continue
      try {
        await pool.query('DELETE FROM posts WHERE id = ?', [postId])
        removed++
        console.log(`  [-] post=${postId}  ${key}  (no longer on PUBG page)`)
      } catch (err) {
        console.error(`  [!] delete post=${postId} failed: ${err.message}`)
      }
    }
  }

  console.log(`[prob-sync] done. inserted=${inserted} updated=${updated} removed=${removed}`)
  await pool.end()
}

main().catch(err => { console.error(err); process.exit(1) })
