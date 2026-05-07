// One-shot: create an admin account for initial server setup.
// Usage: ALLOW_ADMIN_BOOTSTRAP=1 node backend/scripts/create_admin.js
//
// Refuses to run if NODE_ENV=production OR if an admin already exists,
// unless ALLOW_ADMIN_BOOTSTRAP=1 is set explicitly. Guards against
// accidentally re-running on a live server and resetting the admin
// password to the published default.
//
// Override defaults with ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const bcrypt = require('bcryptjs')
const { pool } = require('../db')

const EMAIL = process.env.ADMIN_EMAIL || 'admin@panzone.test'
const PASSWORD = process.env.ADMIN_PASSWORD || 'Admin1234!'
const NAME = process.env.ADMIN_NAME || '관리자'

async function main() {
  const isProd = process.env.NODE_ENV === 'production'
  const explicitBootstrap = process.env.ALLOW_ADMIN_BOOTSTRAP === '1'

  if (isProd && !explicitBootstrap) {
    console.error('[create_admin] Refusing: NODE_ENV=production. Set ADMIN_EMAIL/ADMIN_PASSWORD env vars and ALLOW_ADMIN_BOOTSTRAP=1 to override.')
    process.exit(1)
  }

  const [existingAny] = await pool.query(
    "SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL LIMIT 1"
  )
  if (existingAny.length && !explicitBootstrap) {
    console.error(`[create_admin] Refusing: an admin (id=${existingAny[0].id}) already exists. Set ALLOW_ADMIN_BOOTSTRAP=1 to override (will overwrite this admin's password).`)
    process.exit(1)
  }

  const hash = await bcrypt.hash(PASSWORD, 10)

  const [existing] = await pool.query(
    'SELECT id FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1',
    [EMAIL]
  )

  if (existing.length) {
    await pool.query(
      "UPDATE users SET password_hash = ?, role = 'admin', name = ? WHERE id = ?",
      [hash, NAME, existing[0].id]
    )
    console.log(`✓ Updated existing account id=${existing[0].id}`)
  } else {
    const [result] = await pool.query(
      "INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, 'admin')",
      [EMAIL, hash, NAME]
    )
    console.log(`✓ Created new admin account id=${result.insertId}`)
  }

  console.log('')
  console.log(`  Email:    ${EMAIL}`)
  console.log(`  Password: ${PASSWORD}`)
  console.log(`  Name:     ${NAME}`)
  console.log(`  Role:     admin`)

  await pool.end()
}

main().catch(err => { console.error(err); process.exit(1) })
