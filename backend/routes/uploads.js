const express = require('express')
const multer = require('multer')
const path = require('path')
const crypto = require('crypto')
const { authMiddleware } = require('../middleware/auth')

const router = express.Router()

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads')
const MAX_BYTES = 5 * 1024 * 1024 // 5MB
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp'])

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
    res.json({ url: `/uploads/${req.file.filename}` })
  })
})

module.exports = router
