const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const { authMiddleware } = require('../middleware/auth')

const router = express.Router()

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads')
const IMAGE_MAX_BYTES = 5 * 1024 * 1024  // 5MB
const VIDEO_MAX_BYTES = 50 * 1024 * 1024 // 50MB — phone clips fit, hour-long screen recordings don't
const ALLOWED_IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp'])
const ALLOWED_VIDEO_EXT = new Set(['.mp4', '.webm', '.mov', '.m4v'])

// Magic-byte signatures. The mimetype/extension checks below catch only the
// case where the client *says* it's an image/video — they don't stop someone
// uploading HTML with a .png name and `image/png` MIME header. Reading the
// first ~16 bytes after the file lands on disk and matching real signatures
// closes the polyglot hole.
const MAGIC = [
  // Images
  { ext: '.jpg',  bytes: [0xff, 0xd8, 0xff] },
  { ext: '.jpeg', bytes: [0xff, 0xd8, 0xff] },
  { ext: '.png',  bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { ext: '.gif',  bytes: [0x47, 0x49, 0x46, 0x38] }, // GIF8 (covers 87a/89a)
  { ext: '.webp', bytes: [0x52, 0x49, 0x46, 0x46], suffix: { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] } },
  // Videos
  // MP4 / MOV / M4V: ISO BMFF — bytes 4..7 spell 'ftyp'. Brand at 8..11
  // distinguishes mp42/isom/qt etc., but presence of 'ftyp' is a strong
  // marker by itself.
  { ext: '.mp4', suffix: { offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] } },
  { ext: '.mov', suffix: { offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] } },
  { ext: '.m4v', suffix: { offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] } },
  // WebM / Matroska: EBML header
  { ext: '.webm', bytes: [0x1a, 0x45, 0xdf, 0xa3] },
]

function checkMagic(filePath, ext) {
  const fd = fs.openSync(filePath, 'r')
  try {
    const buf = Buffer.alloc(16)
    const read = fs.readSync(fd, buf, 0, 16, 0)
    return MAGIC.some(rule => {
      if (rule.ext !== ext) return false
      // Either a head match or a suffix match (or both) qualifies.
      const head = rule.bytes ? rule.bytes.every((b, i) => i < read && buf[i] === b) : true
      if (!head) return false
      if (rule.suffix) {
        const { offset, bytes } = rule.suffix
        return bytes.every((b, i) => offset + i < read && buf[offset + i] === b)
      }
      return !!rule.bytes
    })
  } finally {
    fs.closeSync(fd)
  }
}

function makeUploader({ maxBytes, mimePrefix, allowedExt, label }) {
  const storage = multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase()
      const base = crypto.randomBytes(16).toString('hex')
      cb(null, `${base}${ext}`)
    },
  })
  return multer({
    storage,
    limits: { fileSize: maxBytes },
    fileFilter: (req, file, cb) => {
      if (!file.mimetype.startsWith(mimePrefix)) {
        return cb(new Error(`Only ${label} files allowed`))
      }
      const ext = path.extname(file.originalname).toLowerCase()
      if (!allowedExt.has(ext)) {
        return cb(new Error(`Unsupported ${label} format`))
      }
      cb(null, true)
    },
  })
}

const imageUpload = makeUploader({
  maxBytes: IMAGE_MAX_BYTES,
  mimePrefix: 'image/',
  allowedExt: ALLOWED_IMAGE_EXT,
  label: 'image',
})

const videoUpload = makeUploader({
  maxBytes: VIDEO_MAX_BYTES,
  mimePrefix: 'video/',
  allowedExt: ALLOWED_VIDEO_EXT,
  label: 'video',
})

function handleUpload(uploader, kindLabel) {
  return (req, res) => {
    uploader.single('file')(req, res, err => {
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
        fs.unlink(req.file.path, () => {})
        return res.status(400).json({ error: `File contents do not match its declared ${kindLabel} type` })
      }
      res.json({ url: `/uploads/${req.file.filename}` })
    })
  }
}

// POST /api/uploads/image  (multipart/form-data, field: "file")
router.post('/image', authMiddleware, handleUpload(imageUpload, 'image'))

// POST /api/uploads/video  (multipart/form-data, field: "file")
router.post('/video', authMiddleware, handleUpload(videoUpload, 'video'))

module.exports = router
