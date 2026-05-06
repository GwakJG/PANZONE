// Manually run the 30-day suspension purge.
// Usage: node backend/scripts/run_suspension_purge.js

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const { runSuspensionPurge, RETENTION_DAYS } = require('../lib/suspensionPurge')
const { pool } = require('../db')

async function main() {
  const result = await runSuspensionPurge()
  console.log(`Retention: ${RETENTION_DAYS} days`)
  console.log(`Candidates: ${result.candidates}`)
  console.log(`Purged:     ${result.purged}`)
  await pool.end()
}

main().catch(err => { console.error(err); process.exit(1) })
