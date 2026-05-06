// Manually run the orphan-upload cleanup.
// Usage:
//   node backend/scripts/cleanup_uploads.js          (actually deletes)
//   node backend/scripts/cleanup_uploads.js --dry    (preview only)
//   node backend/scripts/cleanup_uploads.js --dry --no-grace  (also show files <24h old)

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const { runUploadCleanup } = require('../lib/uploadCleanup')
const { pool } = require('../db')

async function main() {
  const dryRun = process.argv.includes('--dry')
  const noGrace = process.argv.includes('--no-grace')
  const graceMs = noGrace ? 0 : 24 * 60 * 60 * 1000

  const res = await runUploadCleanup({ dryRun, graceMs })

  const verb = dryRun ? 'WOULD delete' : 'deleted'
  console.log(`${verb}: ${res.deleted}`)
  console.log(`kept (referenced): ${res.kept}`)
  console.log(`stale-grace (skipped, recent): ${res.stale}`)
  console.log(`total files: ${res.total}`)
  if (res.deletedFiles && res.deletedFiles.length) {
    console.log('\nFiles:')
    for (const f of res.deletedFiles) console.log(`  ${f}`)
  }

  await pool.end()
}

main().catch(err => { console.error(err); process.exit(1) })
