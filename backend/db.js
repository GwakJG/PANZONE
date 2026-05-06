const mysql = require('mysql2/promise')
const fs = require('fs')
const path = require('path')

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'pubgop_user',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'pubgop',
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: false,
})

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) NOT NULL PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
}

async function runMigrations() {
  await ensureMigrationsTable()
  const dir = path.join(__dirname, 'migrations')
  if (!fs.existsSync(dir)) return

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()
  const [applied] = await pool.query('SELECT filename FROM schema_migrations')
  const appliedSet = new Set(applied.map(r => r.filename))

  for (const file of files) {
    if (appliedSet.has(file)) continue
    const sql = fs.readFileSync(path.join(dir, file), 'utf8')

    // Strip line comments, then split on ';' at end of line
    const cleaned = sql
      .split('\n')
      .filter(line => !/^\s*--/.test(line))
      .join('\n')

    const statements = cleaned
      .split(/;\s*\n/)
      .map(s => s.trim())
      .filter(Boolean)

    const conn = await pool.getConnection()
    try {
      for (const stmt of statements) await conn.query(stmt)
      await conn.query('INSERT INTO schema_migrations (filename) VALUES (?)', [file])
      console.log(`[db] applied migration: ${file}`)
    } catch (err) {
      conn.release()
      throw new Error(`Migration ${file} failed: ${err.message}`)
    }
    conn.release()
  }
}

// mysql2 returns DATE columns as JS Date objects parsed in the server's local
// timezone, so calling .toISOString().slice(0,10) shifts the date by the UTC
// offset (e.g. on a UTC+2 host, '2026-05-06' becomes '2026-05-05'). Use the
// local accessors instead so the value round-trips as YYYY-MM-DD.
function formatDateOnly(value) {
  if (value == null) return null
  if (typeof value === 'string') return value.slice(0, 10)
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  }
  return String(value).slice(0, 10)
}

module.exports = { pool, runMigrations, formatDateOnly }
