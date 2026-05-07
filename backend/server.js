require('dotenv').config()

// Refuse to boot if NODE_ENV is missing — code paths gate dev affordances
// (devCode, devTempPassword) on `NODE_ENV !== 'production'`. If the operator
// forgets to set NODE_ENV on the production server, every dev affordance
// silently activates and starts leaking codes in HTTP responses. Make it
// explicit. `npm run dev` injects 'development' via cross-env.
const ALLOWED_ENVS = new Set(['production', 'development', 'test'])
if (!ALLOWED_ENVS.has(process.env.NODE_ENV)) {
  console.error(`[fatal] NODE_ENV must be one of: ${[...ALLOWED_ENVS].join(', ')}. Got: ${JSON.stringify(process.env.NODE_ENV)}`)
  process.exit(1)
}

const path = require('path')
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const { runMigrations } = require('./db')
const pubgRoutes = require('./routes/pubg')
const authRoutes = require('./routes/auth')
const postsRoutes = require('./routes/posts')
const commentsRoutes = require('./routes/comments')
const uploadsRoutes = require('./routes/uploads')
const reportsRoutes = require('./routes/reports')
const searchesRoutes = require('./routes/searches')
const statsFavoritesRoutes = require('./routes/statsFavorites')
const pollsRoutes = require('./routes/polls')
const usersRoutes = require('./routes/users')
const adminRoutes = require('./routes/admin')
const inquiriesRoutes = require('./routes/inquiries')
const notificationsRoutes = require('./routes/notifications')
const { runUploadCleanup } = require('./lib/uploadCleanup')
const { runSuspensionPurge } = require('./lib/suspensionPurge')

const app = express()
const PORT = process.env.PORT || 3001
const isProd = process.env.NODE_ENV === 'production'

// Behind nginx — needed for express-rate-limit to read the client IP
// from X-Forwarded-For instead of seeing every request as 127.0.0.1.
app.set('trust proxy', 1)

// Security headers. Loosened defaults:
//   - contentSecurityPolicy: false — would block existing inline styles /
//     event handlers in user-authored post bodies. Revisit after a CSP audit.
//   - crossOriginResourcePolicy: 'cross-origin' — /uploads/* is fetched by
//     the SPA on a different port in dev (5173 vs 3001).
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false,
}))

// Production: only the live domain (and www) — block reflected-XSS-via-CORS
// from any other origin. Dev: any origin (vite on 5173).
const corsOptions = isProd
  ? { origin: ['https://panzone.org', 'https://www.panzone.org'], credentials: true }
  : { origin: true, credentials: true }
app.use(cors(corsOptions))

app.use(express.json({ limit: '2mb' }))

app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '7d',
  index: false,
  setHeaders: res => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
  },
}))

// Rate-limit auth endpoints. Without this, /forgot-password lets an
// attacker enumerate accounts AND DoS valid users (every call to
// /forgot-password rotates that user's password to a fresh temp value).
// 5/min per IP keeps legitimate retry feasible while blocking automated
// abuse. Signup is slightly more permissive.
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '요청이 너무 많습니다. 1분 후 다시 시도해주세요.' },
})
app.use('/api/auth/login', authLimiter)
app.use('/api/auth/send-code', authLimiter)
app.use('/api/auth/forgot-password', authLimiter)
app.use('/api/auth/signup', rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '회원가입 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.' },
}))

app.use('/api/pubg', pubgRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/posts', postsRoutes)
app.use('/api/comments', commentsRoutes)
app.use('/api/uploads', uploadsRoutes)
app.use('/api/reports', reportsRoutes)
app.use('/api/searches', searchesRoutes)
app.use('/api/stats-favorites', statsFavoritesRoutes)
app.use('/api/polls', pollsRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/inquiries', inquiriesRoutes)
app.use('/api/notifications', notificationsRoutes)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

// JSON 404 — must come after all /api routes but before the error handler.
app.use('/api/', (req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// Global error handler — catches anything an async route forgot to try/catch
// (Express 5 auto-forwards rejected promises here). Returns JSON, not Express's
// default HTML, so the frontend's parseJsonOrThrow keeps working.
app.use((err, req, res, _next) => {
  console.error('[unhandled]', err)
  if (res.headersSent) return
  res.status(500).json({ error: 'Internal error' })
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
