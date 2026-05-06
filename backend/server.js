require('dotenv').config()
const path = require('path')
const express = require('express')
const cors = require('cors')
const { runMigrations } = require('./db')
const pubgRoutes = require('./routes/pubg')
const authRoutes = require('./routes/auth')
const postsRoutes = require('./routes/posts')
const commentsRoutes = require('./routes/comments')
const uploadsRoutes = require('./routes/uploads')
const reportsRoutes = require('./routes/reports')
const searchesRoutes = require('./routes/searches')
const pollsRoutes = require('./routes/polls')
const usersRoutes = require('./routes/users')
const adminRoutes = require('./routes/admin')
const inquiriesRoutes = require('./routes/inquiries')
const notificationsRoutes = require('./routes/notifications')
const { runUploadCleanup } = require('./lib/uploadCleanup')
const { runSuspensionPurge } = require('./lib/suspensionPurge')

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json({ limit: '2mb' }))

app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '7d',
  index: false,
}))

app.use('/api/pubg', pubgRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/posts', postsRoutes)
app.use('/api/comments', commentsRoutes)
app.use('/api/uploads', uploadsRoutes)
app.use('/api/reports', reportsRoutes)
app.use('/api/searches', searchesRoutes)
app.use('/api/polls', pollsRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/inquiries', inquiriesRoutes)
app.use('/api/notifications', notificationsRoutes)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

// Daily orphan-upload cleanup. First run 5 min after boot, then every 24h.
// Manual trigger: `node backend/scripts/cleanup_uploads.js [--dry]`.
function scheduleUploadCleanup() {
  const DAY_MS = 24 * 60 * 60 * 1000
  const FIRST_DELAY_MS = 5 * 60 * 1000
  async function tick() {
    try {
      const result = await runUploadCleanup()
      console.log(`[cleanup] deleted=${result.deleted} kept=${result.kept} stale=${result.stale} total=${result.total}`)
    } catch (err) {
      console.error('[cleanup]', err.message)
    }
    setTimeout(tick, DAY_MS)
  }
  setTimeout(tick, FIRST_DELAY_MS)
}

// Daily suspension purge. First run 7 min after boot (staggered from upload cleanup).
function scheduleSuspensionPurge() {
  const DAY_MS = 24 * 60 * 60 * 1000
  const FIRST_DELAY_MS = 7 * 60 * 1000
  async function tick() {
    try {
      const result = await runSuspensionPurge()
      if (result.candidates > 0) {
        console.log(`[suspension:purge] purged=${result.purged}/${result.candidates}`)
      }
    } catch (err) {
      console.error('[suspension:purge]', err.message)
    }
    setTimeout(tick, DAY_MS)
  }
  setTimeout(tick, FIRST_DELAY_MS)
}

runMigrations()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Backend running on http://localhost:${PORT}`)
    })
    scheduleUploadCleanup()
    scheduleSuspensionPurge()
  })
  .catch(err => {
    console.error('[startup] migration failed:', err.message)
    process.exit(1)
  })
