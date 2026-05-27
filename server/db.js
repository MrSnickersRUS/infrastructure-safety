import { Pool } from 'pg'

const sslEnabled = process.env.DB_SSL === 'true'
const ssl = sslEnabled ? { rejectUnauthorized: false } : undefined

const connectionString = process.env.DATABASE_URL

const pool = new Pool(
  connectionString
    ? { connectionString, ssl }
    : {
        host: process.env.DB_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT || 5432),
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'infrastructure_safety',
        ssl,
      },
)

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

export { pool }
