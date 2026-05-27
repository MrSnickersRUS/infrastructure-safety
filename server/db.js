import { Pool } from 'pg'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs/promises'

const sslEnabled = process.env.DB_SSL === 'true'
const ssl = sslEnabled ? { rejectUnauthorized: false } : undefined

const connectionString = process.env.DATABASE_URL

const pool = new Pool(
  connectionString
    ? { connectionString, ssl, max: Number(process.env.DB_POOL_MAX || 10) }
    : {
        host: process.env.DB_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT || 5432),
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'infrastructure_safety',
        ssl,
        max: Number(process.env.DB_POOL_MAX || 10),
      },
)

pool.on('error', (err) => {
  // Don't crash on idle-client errors — log and let the pool reconnect.
  console.error('[pg] idle client error:', err.message)
})

export async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS infrastructures (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      status TEXT NOT NULL,
      last_check DATE NOT NULL,
      description TEXT NOT NULL,
      address TEXT,
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION
    );
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT now()
    );
  `)
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function loadSeedItems() {
  // Look for db.json next to the project root (works for both
  // `node server/index.js` from repo root and the Docker layout where
  // db.json is copied to /app/db.json).
  const candidates = [
    path.resolve(__dirname, '..', 'db.json'),
    path.resolve(process.cwd(), 'db.json'),
  ]
  for (const candidate of candidates) {
    try {
      const raw = await fs.readFile(candidate, 'utf8')
      const json = JSON.parse(raw)
      return Array.isArray(json.infrastructures) ? json.infrastructures : []
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  return []
}

export async function seedIfEmpty() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM infrastructures')
  if (rows[0].count > 0) return 0

  const items = await loadSeedItems()
  if (items.length === 0) return 0

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const item of items) {
      await client.query(
        `INSERT INTO infrastructures (id, name, type, severity, status, last_check, description, address, latitude, longitude)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO NOTHING`,
        [
          item.id,
          item.name,
          item.type,
          item.severity,
          item.status,
          item.lastCheck,
          item.description,
          item.address ?? null,
          item.latitude ?? null,
          item.longitude ?? null,
        ],
      )
    }
    await client.query(
      `SELECT setval(pg_get_serial_sequence('infrastructures', 'id'), GREATEST((SELECT MAX(id) FROM infrastructures), 1))`,
    )
    await client.query('COMMIT')
    return items.length
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export { pool }
