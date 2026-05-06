// One-shot: create an admin account with fixed test credentials.
// Usage: node backend/scripts/create_admin.js
// If the account already exists, it just re-hashes the password and sets role=admin.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const bcrypt = require('bcryptjs')
const { pool } = require('../db')

const EMAIL = 'admin@panzone.test'
const PASSWORD = 'Admin1234!'
const NAME = '관리자'

async function main() {
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
