// User inquiries. Currently scoped to suspension appeals submitted by suspended users;
// a general contact form can reuse the same table via kind='general' later.
const express = require('express')
const { pool } = require('../db')
const { authMiddleware } = require('../middleware/auth')

const router = express.Router()

const MESSAGE_MAX = 1000
const MAX_IMAGES = 2
const IMAGE_URL_MAX = 500
const ALLOWED_KINDS = new Set(['suspension_appeal', 'general'])

function validateImages(urls) {
  if (urls === undefined || urls === null) return { ok: true, urls: [] }
  if (!Array.isArray(urls)) return { ok: false, error: 'imageUrls must be an array' }
  if (urls.length > MAX_IMAGES) return { ok: false, error: `Up to ${MAX_IMAGES} images` }
  for (const u of urls) {
    if (typeof u !== 'string' || !u.length || u.length > IMAGE_URL_MAX) {
      return { ok: false, error: 'Invalid image URL' }
    }
    if (!u.startsWith('/uploads/')) {
      return { ok: false, error: 'Image URL must be an uploaded file' }
    }
  }
  return { ok: true, urls }
}

// POST /api/inquiries { kind?, message, imageUrls? }
// Suspended users use kind='suspension_appeal' to appeal. Intentionally does NOT
// use requireActive — suspended users need to be able to call this.
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { kind = 'suspension_appeal', message, imageUrls } = req.body || {}
    if (!ALLOWED_KINDS.has(kind)) return res.status(400).json({ error: 'Invalid kind' })

    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message required' })
    }
    const trimmed = message.trim()
    if (trimmed.length > MESSAGE_MAX) return res.status(400).json({ error: 'Message too long' })

    const imagesCheck = validateImages(imageUrls)
    if (!imagesCheck.ok) return res.status(400).json({ error: imagesCheck.error })

    // For suspension appeals, require the user to actually be suspended.
    if (kind === 'suspension_appeal') {
      const [rows] = await pool.query(
        'SELECT suspended_at FROM users WHERE id = ? LIMIT 1',
        [req.user.id]
      )
      if (!rows.length || !rows[0].suspended_at) {
        return res.status(400).json({ error: 'Not a suspended account' })
      }
    }

    await pool.query(
      `INSERT INTO inquiries (user_id, kind, message, image_urls)
       VALUES (?, ?, ?, ?)`,
      [
        req.user.id,
        kind,
        trimmed,
        imagesCheck.urls.length ? JSON.stringify(imagesCheck.urls) : null,
      ]
    )
    res.json({ ok: true })
  } catch (err) {
    console.error('[inquiries:create]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

module.exports = router
