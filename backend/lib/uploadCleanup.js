// Upload orphan-file cleanup.
//
// Every feature that saves an /uploads/xxx URL into the DB must be discoverable
// by this cleanup, or its files will be deleted. The registry pattern below lets
// new features add themselves with `registerUploadSource(fn)` — `fn` returns the
// array of currently-referenced URL strings (or filenames).
//
// Built-in sources (registered on module load): users.avatar_url, post_images.url,
// comments.image_url, reports.image_urls (JSON), and any /uploads/... URLs found
// in posts.body HTML (image/video src, etc.).

const fs = require('fs/promises')
const path = require('path')
const { pool } = require('../db')

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads')
const GRACE_MS = 24 * 60 * 60 * 1000 // don't delete files uploaded within the last 24h

// Accept either `/uploads/xxx.jpg` or bare `xxx.jpg` — normalize to filename.
function toFilename(url) {
  if (!url || typeof url !== 'string') return null
  const m = url.match(/\/uploads\/([\w.-]+)$/)
  if (m) return m[1]
  // bare filename fallback
  if (/^[\w.-]+$/.test(url)) return url
  return null
}

const collectors = []

function registerUploadSource(fn) {
  collectors.push(fn)
}

async function collectReferencedFilenames() {
  const names = new Set()
  for (const fn of collectors) {
    try {
      const items = await fn()
      for (const item of items || []) {
        const f = toFilename(item)
        if (f) names.add(f)
      }
    } catch (err) {
      console.error('[cleanup:collector]', err.message)
      // Fail closed: if a collector errors, abort cleanup to avoid nuking files
      // whose references we couldn't verify this pass.
      throw err
    }
  }
  return names
}

// --- Built-in collectors ---

registerUploadSource(async () => {
  const [rows] = await pool.query(
    "SELECT avatar_url AS u FROM users WHERE avatar_url IS NOT NULL AND avatar_url LIKE '/uploads/%'"
  )
  return rows.map(r => r.u)
})

registerUploadSource(async () => {
  const [rows] = await pool.query(
    "SELECT url AS u FROM post_images WHERE url LIKE '/uploads/%'"
  )
  return rows.map(r => r.u)
})

registerUploadSource(async () => {
  const [rows] = await pool.query(
    "SELECT image_url AS u FROM comments WHERE image_url IS NOT NULL AND image_url LIKE '/uploads/%'"
  )
  return rows.map(r => r.u)
})

registerUploadSource(async () => {
  const [rows] = await pool.query(
    'SELECT image_urls FROM reports WHERE image_urls IS NOT NULL'
  )
  const urls = []
  for (const r of rows) {
    let arr = r.image_urls
    if (typeof arr === 'string') {
      try { arr = JSON.parse(arr) } catch { arr = null }
    }
    if (Array.isArray(arr)) {
      for (const u of arr) if (typeof u === 'string') urls.push(u)
    }
  }
  return urls
})

// posts.body is HTML — extract every /uploads/... reference (img src, video src, anchor href, etc.).
registerUploadSource(async () => {
  const [rows] = await pool.query(
    "SELECT body FROM posts WHERE body LIKE '%/uploads/%'"
  )
  const urls = []
  const re = /\/uploads\/[\w.-]+/g
  for (const r of rows) {
    const matches = r.body && r.body.match(re)
    if (matches) for (const u of matches) urls.push(u)
  }
  return urls
})

// Carousel banner images (type='banner' rows in featured_posts).
registerUploadSource(async () => {
  const [rows] = await pool.query(
    "SELECT banner_image_url AS u FROM featured_posts WHERE banner_image_url LIKE '/uploads/%'"
  )
  return rows.map(r => r.u)
})

// --- Main entry ---

async function runUploadCleanup({ dryRun = false, graceMs = GRACE_MS } = {}) {
  const referenced = await collectReferencedFilenames()

  let files
  try {
    files = await fs.readdir(UPLOAD_DIR)
  } catch (err) {
    if (err.code === 'ENOENT') return { deleted: 0, kept: 0, stale: 0, total: 0, dryRun }
    throw err
  }

  const now = Date.now()
  let deleted = 0
  let kept = 0
  let stale = 0
  const deletedFiles = []

  for (const file of files) {
    const full = path.join(UPLOAD_DIR, file)
    let st
    try { st = await fs.stat(full) } catch { continue }
    if (!st.isFile()) continue

    if (referenced.has(file)) { kept++; continue }

    if (now - st.mtimeMs < graceMs) { stale++; continue }

    if (!dryRun) {
      try {
        await fs.unlink(full)
      } catch (err) {
        console.error('[cleanup:unlink]', file, err.message)
        continue
      }
    }
    deleted++
    deletedFiles.push(file)
  }

  return { deleted, kept, stale, total: files.length, dryRun, deletedFiles }
}

module.exports = {
  registerUploadSource,
  runUploadCleanup,
  collectReferencedFilenames,
  UPLOAD_DIR,
}
