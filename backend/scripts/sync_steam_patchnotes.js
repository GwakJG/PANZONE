// Backfill / sync PUBG Steam News (patchnotes tag) into the `patch` board.
// For each item we fetch the full pubg.com article and store the rich body.
//
// Usage:
//   node backend/scripts/sync_steam_patchnotes.js                # import new items since 2025-01-01
//   node backend/scripts/sync_steam_patchnotes.js --since 2024-01-01
//   node backend/scripts/sync_steam_patchnotes.js --count 500    # search wider Steam feed
//   node backend/scripts/sync_steam_patchnotes.js --dry          # preview only
//   node backend/scripts/sync_steam_patchnotes.js --reprocess    # refetch + overwrite bodies of already-imported posts
//
// Idempotent: each Steam news GID is recorded in `steam_news_imports`.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const { pool, runMigrations } = require('../db')
const { fetchSteamNews, bbcodeToHtml, isPatchNote } = require('../lib/steamNews')
const { fetchPubgArticle } = require('../lib/pubgArticle')

function parseArgs(argv) {
  const out = { since: '2025-01-01', count: 200, dry: false, reprocess: false }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--since') out.since = argv[++i]
    else if (a === '--count') out.count = Number(argv[++i]) || 200
    else if (a === '--dry') out.dry = true
    else if (a === '--reprocess') out.reprocess = true
  }
  return out
}

function truncate(s, n) {
  if (!s) return ''
  return s.length <= n ? s : s.slice(0, n - 1) + '…'
}

function cleanTitle(raw) {
  let t = String(raw || '').trim()
  // Strip noisy prefixes Steam adds.
  t = t.replace(/^pubg:\s*battlegrounds\s*[-–—:]\s*/i, '')
  t = t.replace(/^\[pubg\]\s*/i, '')
  return truncate(t, 200) || 'Untitled'
}

function extractFirstImage(html) {
  if (!html) return null
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i)
  if (!m) return null
  const url = m[1]
  return url.length <= 500 ? url : null
}

// Pull the canonical pubg.com/news/<id> URL out of the Steam content body so
// users go straight to PUBG's site instead of Steam's "leaving Steam" wrapper.
function extractPubgUrl(rawContents) {
  if (!rawContents) return null
  const m = rawContents.match(/https?:\/\/(?:www\.)?pubg\.com\/(?:[a-z\-]+\/)?news\/(\d+)/i)
  if (!m) return null
  // PUBG serves the same article in both /news/<id> (English SSR) and
  // /ko/news/<id> (Korean SSR). We fetch the Korean version so the post body
  // is in Korean — keeps the site's tone consistent (loot disclosure is also
  // Korean only on PUBG's side).
  return `https://pubg.com/ko/news/${m[1]}`
}

// Build the title + body for a Steam news item. Prefer the Korean pubg.com
// article (rich content + Korean <title>); fall back to the bare-bones Steam
// BBCode body and the Steam title.
async function buildPostContent(item) {
  const pubgUrl = extractPubgUrl(item.contents)
  let body = ''
  let title = null
  let source = 'steam'

  if (pubgUrl) {
    try {
      const article = await fetchPubgArticle(pubgUrl)
      body = article.body
      title = article.title
      source = 'pubg'
    } catch (err) {
      console.warn(`  [warn] pubg.com fetch failed (${err.message}); falling back to Steam body`)
    }
  }

  if (!body) body = bbcodeToHtml(item.contents)
  if (!title) title = cleanTitle(item.title)

  const sourceUrl = pubgUrl || item.url
  const sourceLabel = source === 'pubg' ? '원문 보기 (PUBG 공식)' : '원문 보기'
  const footer = sourceUrl
    ? `\n<p><a href="${sourceUrl}" target="_blank" rel="noopener">${sourceLabel}</a></p>`
    : ''

  return { title, body: body + footer }
}

async function pickAdminUserId() {
  const [rows] = await pool.query(
    "SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL ORDER BY id ASC LIMIT 1"
  )
  if (!rows.length) {
    throw new Error("No admin user found. Run `node backend/scripts/create_admin.js` first.")
  }
  return rows[0].id
}

async function getPatchBoardId() {
  const [rows] = await pool.query("SELECT id FROM boards WHERE slug = 'patch' LIMIT 1")
  if (!rows.length) throw new Error("`patch` board not found — run migrations first.")
  return rows[0].id
}

async function alreadyImportedSet() {
  const [rows] = await pool.query('SELECT gid FROM steam_news_imports')
  return new Set(rows.map(r => String(r.gid)))
}

function toMysqlDateTime(d) {
  // 'YYYY-MM-DD HH:MM:SS' in UTC
  const pad = n => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
         `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
}

async function main() {
  const args = parseArgs(process.argv)
  const sinceDate = new Date(args.since + 'T00:00:00Z')
  if (Number.isNaN(sinceDate.getTime())) throw new Error(`Bad --since date: ${args.since}`)

  console.log(`[sync] mode=${args.reprocess ? 'REPROCESS' : 'IMPORT'} since=${args.since} count=${args.count} dry=${args.dry}`)

  await runMigrations()

  const [adminId, boardId, imported] = await Promise.all([
    pickAdminUserId(),
    getPatchBoardId(),
    alreadyImportedSet(),
  ])
  console.log(`[sync] admin user=${adminId}, board=${boardId}, already-imported=${imported.size}`)

  const news = await fetchSteamNews({ count: args.count })
  console.log(`[sync] fetched ${news.length} news items from Steam`)

  if (args.reprocess) {
    return reprocessExisting(news, args)
  }

  const candidates = news.filter(it =>
    it.date >= sinceDate &&
    isPatchNote(it) &&
    !imported.has(it.gid)
  )
  candidates.sort((a, b) => a.date - b.date)

  console.log(`[sync] ${candidates.length} new patchnote(s) to import`)

  let inserted = 0
  for (const item of candidates) {
    const { title: rawTitle, body: rawBody } = await buildPostContent(item)
    const title = truncate(rawTitle, 200)
    const fullBody = rawBody.trim()
    const createdAt = toMysqlDateTime(item.date)
    const thumb = extractFirstImage(fullBody)

    if (args.dry) {
      console.log(`  [dry] ${item.date.toISOString().slice(0, 10)}  ${title}  (body=${fullBody.length}b)`)
      continue
    }

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const [r] = await conn.query(
        `INSERT INTO posts (board_id, user_id, title, body, is_pinned, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, ?)`,
        [boardId, adminId, title, fullBody, createdAt, createdAt]
      )
      const postId = r.insertId
      if (thumb) {
        await conn.query(
          'INSERT INTO post_images (post_id, url, sort_order) VALUES (?, ?, 0)',
          [postId, thumb]
        )
      }
      await conn.query(
        'INSERT INTO steam_news_imports (gid, post_id, source_url) VALUES (?, ?, ?)',
        [item.gid, postId, item.url || null]
      )
      await conn.commit()
      inserted++
      console.log(`  [+] ${item.date.toISOString().slice(0, 10)}  post=${postId}  ${title}  (body=${fullBody.length}b)`)
    } catch (err) {
      await conn.rollback()
      console.error(`  [!] failed gid=${item.gid}: ${err.message}`)
    } finally {
      conn.release()
    }
  }

  console.log(`[sync] done. inserted=${inserted}`)
  await pool.end()
}

// Refresh the body of every previously-imported post using the latest pubg.com
// content. Useful when the article fetcher changes (e.g. body sanitizer fix).
async function reprocessExisting(news, args) {
  const newsByGid = new Map(news.map(it => [it.gid, it]))
  const [imports] = await pool.query(
    'SELECT gid, post_id FROM steam_news_imports ORDER BY post_id ASC'
  )
  console.log(`[reprocess] ${imports.length} imported post(s) to refresh`)

  let updated = 0, missing = 0
  for (const row of imports) {
    const item = newsByGid.get(String(row.gid))
    if (!item) {
      missing++
      console.warn(`  [skip] post=${row.post_id} gid=${row.gid} not in current Steam feed (try --count higher)`)
      continue
    }
    try {
      const { title: rawTitle, body: rawBody } = await buildPostContent(item)
      const title = truncate(rawTitle, 200)
      const fullBody = rawBody.trim()
      const thumb = extractFirstImage(fullBody)

      if (args.dry) {
        console.log(`  [dry] post=${row.post_id} ${title} (body=${fullBody.length}b)`)
        continue
      }

      const conn = await pool.getConnection()
      try {
        await conn.beginTransaction()
        await conn.query('UPDATE posts SET title = ?, body = ? WHERE id = ?', [title, fullBody, row.post_id])
        await conn.query('DELETE FROM post_images WHERE post_id = ?', [row.post_id])
        if (thumb) {
          await conn.query(
            'INSERT INTO post_images (post_id, url, sort_order) VALUES (?, ?, 0)',
            [row.post_id, thumb]
          )
        }
        await conn.commit()
        updated++
        console.log(`  [~] post=${row.post_id} ${title} (body=${fullBody.length}b)`)
      } catch (err) {
        await conn.rollback()
        console.error(`  [!] post=${row.post_id} update failed: ${err.message}`)
      } finally {
        conn.release()
      }
    } catch (err) {
      console.error(`  [!] post=${row.post_id} fetch failed: ${err.message}`)
    }
  }
  console.log(`[reprocess] done. updated=${updated} missing=${missing}`)
  await pool.end()
}

main().catch(err => { console.error(err); process.exit(1) })
