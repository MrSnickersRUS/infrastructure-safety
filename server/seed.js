import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs/promises'
import { pool, ensureSchema } from './db.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const dbPath = path.join(rootDir, 'db.json')

const raw = await fs.readFile(dbPath, 'utf8')
const json = JSON.parse(raw)
const items = Array.isArray(json.infrastructures) ? json.infrastructures : []

await ensureSchema()

await pool.query('BEGIN')
try {
  await pool.query('TRUNCATE infrastructures RESTART IDENTITY')

  for (const item of items) {
    await pool.query(
      `INSERT INTO infrastructures (id, name, type, severity, status, last_check, description, address, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         type = EXCLUDED.type,
         severity = EXCLUDED.severity,
         status = EXCLUDED.status,
         last_check = EXCLUDED.last_check,
         description = EXCLUDED.description,
         address = EXCLUDED.address,
         latitude = EXCLUDED.latitude,
         longitude = EXCLUDED.longitude`,
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

  await pool.query(
    `SELECT setval(pg_get_serial_sequence('infrastructures', 'id'), (SELECT MAX(id) FROM infrastructures))`,
  )
  await pool.query('COMMIT')
} catch (error) {
  await pool.query('ROLLBACK')
  throw error
} finally {
  await pool.end()
}
