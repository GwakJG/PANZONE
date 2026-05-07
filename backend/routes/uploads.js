const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const { authMiddleware } = require('../middleware/auth')

const router = express.Router()

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads')
const MAX_BYTES = 5 * 1024 * 1024 // 5MB
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp'])

// Magic-byte signatures. The mimetype/extension checks below catch only the
// case where the client *says* it's an image — they don't stop someone
// uploading an HTML/SVG file with a .png name and `image/png` MIME header.
// Reading the first ~16 bytes after the file lands on disk and matching
// real signatures closes the polyglot hole.
const MAGIC = [
  { ext: '.jpg',  bytes: [0xff, 0xd8, 0xff] },
  { ext: '.jpeg', bytes: [0xff, 0xd8, 0xff] },
  { ext: '.png',  bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { ext: '.gif',  bytes: [0x47, 0x49, 0x46, 0x38] }, // GIF8 (covers 87a/89a)
  // WEBP: 'RIFF' .... 'WEBP' — 4 bytes + 4 bytes size + 'WEBP' at offset 8
  { ext: '.webp', bytes: [0x52, 0x49, 0x46, 0x46], suffix: { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] } },
]

function checkMagic(filePath, ext) {
  const fd = fs.openSync(filePath, 'r')
  try {
    const buf = Buffer.alloc(16)
    const read = fs.readSync(fd, buf, 0, 16, 0)
    return MAGIC.some(rule => {
      if (rule.ext !== ext) return false
      const head = rule.bytes.every((b, i) => i < read && buf[i] === b)
      if (!head) return false
      if (rule.suffix) {
        const { offset, bytes } = rule.suffix
        return bytes.every((b, i) => offset + i < read && buf[offset + i] === b)
      }
      return true
    })
  } finally {
    fs.closeSync(fd)
  }
}

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    const base = crypto.randomBytes(16).toString('hex')
    cb(null, `${base}${ext}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: MAX_BYTES },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files allowed'))
    }
    const ext = path.extname(file.originalname).toLowerCase()
    if (!ALLOWED_EXT.has(ext)) {
      return cb(new Error('Unsupported image format'))
    }
    cb(null, true)
  },
})

// POST /api/uploads/image  (multipart/form-data, field: "file")
router.post('/image', authMiddleware, (req, res) => {
  upload.single('file')(req, res, err => {
    if (err) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400
      return res.status(status).json({ error: err.message })
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
    const ext = path.extname(req.file.filename).toLowerCase()
    let passed = false
    try {
      passed = checkMagic(req.file.path, ext)
    } catch (e) {
      console.error('[uploads:magic]', e)
    }
    if (!passed) {
      // Reject + delete the just-uploaded file so we don't leave polyglot
      // payloads on disk.
      fs.unlink(req.file.path, () => {})
      return res.status(400).json({ error: 'File contents do not match its declared image type' })
    }
    res.json({ url: `/uploads/${req.file.filename}` })
  })
})

module.exports = router
