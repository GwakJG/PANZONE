const express = require('express')
const bcrypt = require('bcryptjs')
const { pool, formatDateOnly } = require('../db')
const { authMiddleware, sign } = require('../middleware/auth')
const { requireActive } = require('../middleware/requireActive')
const { calcTier } = require('../lib/tier')
const { sendMail } = require('../lib/mail')
const { verificationCode, tempPasswordMail } = require('../lib/mailTemplates')
const { isBlockedNickname } = require('../lib/nicknamePolicy')

const router = express.Router()

const CODE_TTL_MS = 5 * 60 * 1000
const DEV_EXPOSE_CODE = process.env.NODE_ENV !== 'production'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,12}$/
const NICKNAME_RE = /^[\uAC00-\uD7A3A-Za-z0-9]{2,8}$/

function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role || 'user',
    avatarUrl: u.avatar_url || null,
    bio: u.bio || null,
    tier: calcTier(u),
    postCount: u.post_count || 0,
    commentCount: u.comment_count || 0,
    visitCount: u.visit_count || 0,
    lastVisitDate: formatDateOnly(u.last_visit_date),
    suspended: !!u.suspended_at,
    suspendReason: u.suspend_reason || null,
  }
}

const BIO_MAX = 20
const AVATAR_URL_MAX = 500

// Fields needed for publicUser() + tier calculation.
const USER_COLUMNS = 'id, email, name, avatar_url, bio, role, created_at, post_count, comment_count, visit_count, last_visit_date, achieved_tier, suspended_at, suspend_reason'

// Generate a 10-char password matching our PASSWORD_RE: letter + digit + symbol, 8-12 chars.
function generateTempPassword() {
  const letters = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ'
  const digits = '23456789'
  const symbols = '!@#$%^&*?'
  const pool = letters + digits + symbols
  const pick = src => src[Math.floor(Math.random() * src.length)]
  const required = [pick(letters), pick(digits), pick(symbols)]
  const rest = Array.from({ length: 7 }, () => pick(pool))
  const arr = [...required, ...rest]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr.join('')
}

// GET /api/auth/check-nickname?name=X
// Returns { available, reason? } — reason is 'blocked' for brand/staff-impersonation
// matches (distinct from 'taken') so the UI can show a different message.
router.get('/check-nickname', async (req, res) => {
  try {
    const raw = (req.query.name || '').trim()
    if (!NICKNAME_RE.test(raw)) {
      return res.status(400).json({ error: 'Invalid nickname' })
    }
    if (isBlockedNickname(raw)) {
      return res.json({ available: false, reason: 'blocked' })
    }
    const [rows] = await pool.query(
      'SELECT id FROM users WHERE name = ? AND deleted_at IS NULL LIMIT 1',
      [raw]
    )
    res.json({
      available: rows.length === 0,
      reason: rows.length === 0 ? undefined : 'taken',
    })
  } catch (err) {
    console.error('[check-nickname]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// POST /api/auth/send-code { email }
router.post('/send-code', async (req, res) => {
  try {
    const { email } = req.body || {}
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Invalid email' })
    }

    const [users] = await pool.query('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL', [email])
    if (users.length) return res.status(409).json({ error: 'Email already registered' })

    const code = String(Math.floor(100000 + Math.random() * 900000))
    const expiresAt = new Date(Date.now() + CODE_TTL_MS)

    await pool.query(`
      INSERT INTO verification_codes (email, code, expires_at, verified)
      VALUES (?, ?, ?, 0)
      ON DUPLICATE KEY UPDATE code = VALUES(code), expires_at = VALUES(expires_at), verified = 0
    `, [email, code, expiresAt])

    // sendMail is fire-and-await: in dev mode (no RESEND_API_KEY) it just
    // logs and returns ok. In prod a failed send is logged but doesn't 500 —
    // the code is still stored, so retry via resend button would work.
    await sendMail({ to: email, ...verificationCode({ code }) })

    const body = { ok: true }
    if (DEV_EXPOSE_CODE) body.devCode = code
    res.json(body)
  } catch (err) {
    console.error('[send-code]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// POST /api/auth/signup { email, code, password, name? }
router.post('/signup', async (req, res) => {
  try {
    const { email, code, password, name } = req.body || {}
    if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'Invalid email' })
    if (!code) return res.status(400).json({ error: 'Verification code required' })
    if (!password || !PASSWORD_RE.test(password)) return res.status(400).json({ error: 'Password does not meet requirements' })

    const [rows] = await pool.query('SELECT code, expires_at FROM verification_codes WHERE email = ?', [email])
    if (!rows.length || rows[0].code !== code) return res.status(400).json({ error: 'Invalid code' })
    if (new Date(rows[0].expires_at).getTime() < Date.now()) return res.status(400).json({ error: 'Code expired' })

    const [dup] = await pool.query('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL', [email])
    if (dup.length) return res.status(409).json({ error: 'Email already registered' })

    const displayName = (name && name.trim()) || email.split('@')[0]
    if (!NICKNAME_RE.test(displayName)) {
      return res.status(400).json({ error: 'Invalid nickname' })
    }
    if (isBlockedNickname(displayName)) {
      return res.status(400).json({ error: '사용할 수 없는 닉네임입니다' })
    }
    const [nameDup] = await pool.query(
      'SELECT id FROM users WHERE name = ? AND deleted_at IS NULL',
      [displayName]
    )
    if (nameDup.length) return res.status(409).json({ error: 'Nickname already taken' })

    const hash = await bcrypt.hash(password, 10)

    const [result] = await pool.query(
      'INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)',
      [email, hash, displayName]
    )
    await pool.query('DELETE FROM verification_codes WHERE email = ?', [email])

    const [newUserRows] = await pool.query(
      `SELECT ${USER_COLUMNS} FROM users WHERE id = ?`,
      [result.insertId]
    )
    // 회원가입은 곧바로 자동 로그인 — 새 가입자가 브라우저 닫았다고 풀려서 다시 로그인하게 만들지 않음.
    const token = sign(newUserRows[0], { persistent: true })
    res.json({ token, user: publicUser(newUserRows[0]) })
  } catch (err) {
    console.error('[signup]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// POST /api/auth/forgot-password { email }
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body || {}
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Invalid email' })
    }

    const [rows] = await pool.query(
      'SELECT id FROM users WHERE email = ? AND deleted_at IS NULL',
      [email]
    )
    // Always respond { ok: true } regardless of whether the email is registered.
    // Returning 404 leaks the user list (account enumeration); attackers could
    // probe forgot-password to build a list of valid signups.
    if (!rows.length) {
      return res.json({ ok: true })
    }

    const tempPassword = generateTempPassword()
    const hash = await bcrypt.hash(tempPassword, 10)
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, rows[0].id])

    await sendMail({ to: email, ...tempPasswordMail({ password: tempPassword }) })

    const body = { ok: true }
    if (DEV_EXPOSE_CODE) body.devTempPassword = tempPassword
    res.json(body)
  } catch (err) {
    console.error('[forgot-password]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// POST /api/auth/login { email, password, rememberMe }
router.post('/login', async (req, res) => {
  try {
    const { email, password, rememberMe } = req.body || {}
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' })

    const [rows] = await pool.query(
      `SELECT ${USER_COLUMNS}, password_hash FROM users WHERE email = ? AND deleted_at IS NULL`,
      [email]
    )
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' })
    const user = rows[0]

    const ok = await bcrypt.compare(password, user.password_hash)
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' })

    // Suspended users CAN log in but have read-only access enforced by requireActive
    // middleware. Profile page exposes the 문의하기 (appeal) flow to them.
    const token = sign(user, { persistent: !!rememberMe })
    res.json({ token, user: publicUser(user) })
  } catch (err) {
    console.error('[login]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ${USER_COLUMNS} FROM users WHERE id = ? AND deleted_at IS NULL`,
      [req.user.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'User not found' })
    res.json({ user: publicUser(rows[0]) })
  } catch (err) {
    console.error('[me]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// PATCH /api/auth/me  body: { name?, avatarUrl?, bio? }
router.patch('/me', authMiddleware, requireActive, async (req, res) => {
  try {
    const { name, avatarUrl, bio } = req.body || {}
    const fields = []
    const params = []

    if (name !== undefined) {
      if (typeof name !== 'string') {
        return res.status(400).json({ error: 'name must be string' })
      }
      const trimmed = name.trim()
      if (!NICKNAME_RE.test(trimmed)) {
        return res.status(400).json({ error: 'Invalid nickname' })
      }
      if (isBlockedNickname(trimmed)) {
        return res.status(400).json({ error: '사용할 수 없는 닉네임입니다' })
      }
      const [dup] = await pool.query(
        'SELECT id FROM users WHERE name = ? AND id <> ? AND deleted_at IS NULL LIMIT 1',
        [trimmed, req.user.id]
      )
      if (dup.length) return res.status(409).json({ error: 'Nickname already taken' })
      fields.push('name = ?')
      params.push(trimmed)
    }

    if (avatarUrl !== undefined) {
      if (avatarUrl !== null && typeof avatarUrl !== 'string') {
        return res.status(400).json({ error: 'avatarUrl must be string or null' })
      }
      if (avatarUrl && avatarUrl.length > AVATAR_URL_MAX) {
        return res.status(400).json({ error: 'avatarUrl too long' })
      }
      fields.push('avatar_url = ?')
      params.push(avatarUrl || null)
    }
    if (bio !== undefined) {
      if (bio !== null && typeof bio !== 'string') {
        return res.status(400).json({ error: 'bio must be string or null' })
      }
      const trimmed = bio ? bio.trim() : ''
      if (trimmed.length > BIO_MAX) {
        return res.status(400).json({ error: 'bio too long' })
      }
      fields.push('bio = ?')
      params.push(trimmed || null)
    }

    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' })

    params.push(req.user.id)
    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params)

    const [rows] = await pool.query(
      `SELECT ${USER_COLUMNS} FROM users WHERE id = ?`,
      [req.user.id]
    )
    res.json({ user: publicUser(rows[0]) })
  } catch (err) {
    console.error('[me:update]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// POST /api/auth/change-password  body: { currentPassword, newPassword }
router.post('/change-password', authMiddleware, requireActive, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {}
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password required' })
    }
    if (!PASSWORD_RE.test(newPassword)) {
      return res.status(400).json({ error: 'Password does not meet requirements' })
    }

    const [rows] = await pool.query(
      'SELECT password_hash FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [req.user.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'User not found' })

    const ok = await bcrypt.compare(currentPassword, rows[0].password_hash)
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect' })

    if (await bcrypt.compare(newPassword, rows[0].password_hash)) {
      return res.status(400).json({ error: 'New password must differ from current' })
    }

    const hash = await bcrypt.hash(newPassword, 10)
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id])
    res.json({ ok: true })
  } catch (err) {
    console.error('[change-password]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// DELETE /api/auth/me  body: { password }
// Self-withdraw. Verifies current password, then:
//   1. Soft-deletes all posts + comments with a "회원 탈퇴" reason (tombstones
//      preserve thread shape, same as suspension purge).
//   2. Clears avatar/bio/counters + personal search history.
//   3. Masks email/name so the original values are freed for re-registration
//      (and the UNIQUE constraints don't block it). Masked values kept for
//      audit: deleted_{id}_{ts}@panzone.local / 탈퇴회원_{id}.
//   4. Sets deleted_at + data_purged_at.
// Admin/mod must demote first (mirrors suspend endpoint) so a single admin
// can't accidentally lock the system out of its own account.
router.delete('/me', authMiddleware, async (req, res) => {
  const conn = await pool.getConnection()
  try {
    const { password } = req.body || {}
    if (!password) return res.status(400).json({ error: 'Password required' })

    const [rows] = await conn.query(
      'SELECT id, role, password_hash FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [req.user.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'User not found' })
    const user = rows[0]
    if (user.role === 'admin' || user.role === 'mod') {
      return res.status(400).json({ error: '관리자 계정은 탈퇴할 수 없습니다. 권한을 먼저 해제하세요.' })
    }

    const ok = await bcrypt.compare(password, user.password_hash)
    if (!ok) return res.status(401).json({ error: '비밀번호가 일치하지 않습니다' })

    await conn.beginTransaction()

    const DELETE_REASON = '회원 탈퇴'
    await conn.query(
      `UPDATE posts SET deleted_at = CURRENT_TIMESTAMP, deleted_reason = ?
        WHERE user_id = ? AND deleted_at IS NULL`,
      [DELETE_REASON, user.id]
    )
    await conn.query(
      `UPDATE comments SET deleted_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND deleted_at IS NULL`,
      [user.id]
    )
    await conn.query('DELETE FROM user_searches WHERE user_id = ?', [user.id])

    // Mask email/name to free the UNIQUE slots and strip identifying info.
    // Appending a timestamp guarantees no collision even if the same user
    // account is somehow resurrected later.
    const ts = Date.now()
    const maskedEmail = `deleted_${user.id}_${ts}@panzone.local`
    const maskedName = `탈퇴회원_${user.id}`
    await conn.query(
      `UPDATE users
          SET email = ?,
              name = ?,
              avatar_url = NULL,
              bio = NULL,
              post_count = 0,
              comment_count = 0,
              visit_count = 0,
              deleted_at = CURRENT_TIMESTAMP,
              data_purged_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      [maskedEmail, maskedName, user.id]
    )

    await conn.commit()
    res.json({ ok: true })
  } catch (err) {
    await conn.rollback()
    console.error('[auth:delete-account]', err)
    res.status(500).json({ error: 'Internal error' })
  } finally {
    conn.release()
  }
})

module.exports = router
