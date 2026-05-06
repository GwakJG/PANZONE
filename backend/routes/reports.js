const express = require('express')
const { pool } = require('../db')
const { authMiddleware } = require('../middleware/auth')
const { requireActive } = require('../middleware/requireActive')

const router = express.Router()

const REASON_MAX = 500
const ALLOWED_TYPES = new Set(['post', 'comment'])
const ALLOWED_REASON_CODES = new Set([
  'spam', 'abuse', 'adult', 'privacy', 'fake', 'inappropriate', 'other'
])
const MAX_REASONS = 2
const MAX_IMAGES = 2
const IMAGE_URL_MAX = 500

function parseId(raw) {
  if (typeof raw === 'number') {
    return Number.isSafeInteger(raw) && raw > 0 ? raw : null
  }
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null
  const n = Number(raw)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

async function targetExists(type, id) {
  if (type === 'post') {
    const [rows] = await pool.query(
      'SELECT id FROM posts WHERE id = ? AND deleted_at IS NULL',
      [id]
    )
    return rows.length > 0
  }
  if (type === 'comment') {
    const [rows] = await pool.query(
      'SELECT id FROM comments WHERE id = ? AND deleted_at IS NULL',
      [id]
    )
    return rows.length > 0
  }
  return false
}

function validateReasonCodes(codes) {
  if (!Array.isArray(codes)) return { ok: false, error: 'reasonCodes must be an array' }
  if (codes.length === 0) return { ok: false, error: 'At least one reason required' }
  if (codes.length > MAX_REASONS) return { ok: false, error: `Up to ${MAX_REASONS} reasons` }
  const uniq = [...new Set(codes)]
  if (uniq.length !== codes.length) return { ok: false, error: 'Duplicate reason codes' }
  for (const c of codes) {
    if (!ALLOWED_REASON_CODES.has(c)) return { ok: false, error: `Invalid reason code: ${c}` }
  }
  return { ok: true, codes: uniq }
}

function validateImageUrls(urls) {
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

// POST /api/reports { targetType, targetId, reason, reasonCodes, imageUrls? }
router.post('/', authMiddleware, requireActive, async (req, res) => {
  try {
    const { targetType, targetId: rawTargetId, reason, reasonCodes, imageUrls } = req.body || {}
    if (!ALLOWED_TYPES.has(targetType)) {
      return res.status(400).json({ error: 'Invalid targetType' })
    }
    const targetId = parseId(rawTargetId)
    if (!targetId) return res.status(400).json({ error: 'Invalid targetId' })
    if (!reason || !reason.trim()) return res.status(400).json({ error: 'Reason required' })
    if (reason.length > REASON_MAX) return res.status(400).json({ error: 'Reason too long' })

    const codesCheck = validateReasonCodes(reasonCodes)
    if (!codesCheck.ok) return res.status(400).json({ error: codesCheck.error })

    const imagesCheck = validateImageUrls(imageUrls)
    if (!imagesCheck.ok) return res.status(400).json({ error: imagesCheck.error })

    if (!(await targetExists(targetType, targetId))) {
      return res.status(404).json({ error: 'Target not found' })
    }

    const [dup] = await pool.query(
      `SELECT id FROM reports
       WHERE reporter_user_id = ? AND target_type = ? AND target_id = ?
       LIMIT 1`,
      [req.user.id, targetType, targetId]
    )
    if (dup.length) {
      return res.status(409).json({ error: 'Already reported' })
    }

    await pool.query(
      `INSERT INTO reports
         (reporter_user_id, target_type, target_id, reason, reason_codes, image_urls)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        targetType,
        targetId,
        reason.trim(),
        JSON.stringify(codesCheck.codes),
        imagesCheck.urls.length ? JSON.stringify(imagesCheck.urls) : null,
      ]
    )

    res.json({ ok: true })
  } catch (err) {
    console.error('[reports:create]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

module.exports = router
