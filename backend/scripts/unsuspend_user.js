// One-shot: unsuspend a user by nickname.
// Usage: node backend/scripts/unsuspend_user.js <nickname>

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const { pool } = require('../db')

async function main() {
  const nickname = process.argv[2]
  if (!nickname) { console.error('nickname required'); process.exit(1) }

  const [result] = await pool.query(
    'UPDATE users SET suspended_at = NULL, suspend_reason = NULL WHERE name = ?',
    [nickname]
  )
  console.log(`unsuspended '${nickname}' — rows affected: ${result.affectedRows}`)
  await pool.end()
}

main().catch(err => { console.error(err); process.exit(1) })
