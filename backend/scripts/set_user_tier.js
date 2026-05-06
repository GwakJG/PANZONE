// One-shot: set tier on a user by nickname for testing.
// Usage: node backend/scripts/set_user_tier.js <nickname> <tier 0-4>
//   tier 0-3: updates users.achieved_tier. role stays 'user'.
//   tier 4:   sets users.role = 'admin' (calcTier returns 4 via role override).
// Reset: node backend/scripts/set_user_tier.js <nickname> 0

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const { pool } = require('../db')

async function main() {
  const nickname = process.argv[2]
  const tier = parseInt(process.argv[3], 10)
  if (!nickname) { console.error('nickname required'); process.exit(1) }
  if (!Number.isInteger(tier) || tier < 0 || tier > 4) {
    console.error('tier must be 0..4')
    process.exit(1)
  }

  const [[u]] = await pool.query(
    'SELECT id, name, role, achieved_tier FROM users WHERE name = ? AND deleted_at IS NULL LIMIT 1',
    [nickname]
  )
  if (!u) {
    console.error(`User '${nickname}' not found.`)
    process.exit(1)
  }

  if (tier === 4) {
    await pool.query("UPDATE users SET role = 'admin' WHERE id = ?", [u.id])
    console.log(`User '${u.name}' (id=${u.id}) role: ${u.role} → admin  (tier 4)`)
  } else {
    // Revert role to user when setting a numeric tier (avoids stuck-at-4 state).
    await pool.query(
      "UPDATE users SET role = 'user', achieved_tier = ? WHERE id = ?",
      [tier, u.id]
    )
    console.log(`User '${u.name}' (id=${u.id}) role: ${u.role} → user, achieved_tier: ${u.achieved_tier} → ${tier}`)
  }
  await pool.end()
}

main().catch(err => { console.error(err); process.exit(1) })
