import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { pool, ensureSchema, seedIfEmpty } from './db.js'

const NODE_ENV = process.env.NODE_ENV || 'development'
const isProd = NODE_ENV === 'production'

const port = Number(process.env.PORT || 3001)
const JWT_SECRET = process.env.JWT_SECRET || (isProd ? null : 'dev-secret')
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is required in production')
  process.exit(1)
}
const TOKEN_TTL = '2h'

const allowedOriginsRaw = (process.env.ALLOWED_ORIGINS || '').trim()
const allowedOrigins = allowedOriginsRaw
  ? allowedOriginsRaw.split(',').map((s) => s.trim()).filter(Boolean)
  : null // null => allow all (default for dev / same-origin behind nginx)

const app = express()

// Behind nginx — we need correct req.ip for rate limiter and logs
const trustProxy = process.env.TRUST_PROXY ?? '1'
app.set('trust proxy', Number.isFinite(Number(trustProxy)) ? Number(trustProxy) : trustProxy === 'true')

app.use(helmet({
  // The API is consumed by the SPA from the same origin via nginx,
  // so we don't need CSP here (nginx adds headers for the HTML).
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-site' },
}))

app.use(cors({
  origin: (origin, cb) => {
    if (!allowedOrigins) return cb(null, true)
    if (!origin) return cb(null, true) // same-origin / curl
    if (allowedOrigins.includes(origin)) return cb(null, true)
    return cb(new Error('Not allowed by CORS'))
  },
  credentials: false,
}))

app.use(express.json({ limit: '100kb' }))

app.use(morgan(isProd ? 'combined' : 'dev', {
  skip: (req) => req.path === '/api/health',
}))

// Tighter rate limit for auth endpoints — mitigates credential stuffing
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later' },
})

// Looser limiter for mutating endpoints
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
})

const requiredFields = ['name', 'type', 'severity', 'status', 'lastCheck', 'description']

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { error: 'Invalid JSON body' }
  }

  const errors = []
  const normalized = {}

  for (const field of requiredFields) {
    const value = normalizeString(payload[field])
    if (!value) {
      errors.push(`${field} is required`)
    } else {
      normalized[field] = value
    }
  }

  const lastCheck = normalizeString(payload.lastCheck)
  if (lastCheck && !/^\d{4}-\d{2}-\d{2}$/.test(lastCheck)) {
    errors.push('lastCheck must be in YYYY-MM-DD format')
  }

  const address = normalizeString(payload.address)
  const latitude = payload.latitude
  const longitude = payload.longitude
  const hasCoords = latitude !== null && latitude !== undefined && longitude !== null && longitude !== undefined

  if (address && !hasCoords) {
    errors.push('latitude and longitude are required when address is provided')
  }

  if (hasCoords && !address) {
    errors.push('address is required when coordinates are provided')
  }

  if (hasCoords) {
    if (typeof latitude !== 'number' || Number.isNaN(latitude) || latitude < -90 || latitude > 90) {
      errors.push('latitude must be a number between -90 and 90')
    }
    if (
      typeof longitude !== 'number' ||
      Number.isNaN(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      errors.push('longitude must be a number between -180 and 180')
    }
  }

  if (errors.length > 0) {
    return { error: errors.join(', ') }
  }

  return {
    value: {
      name: normalized.name,
      type: normalized.type,
      severity: normalized.severity,
      status: normalized.status,
      lastCheck: normalized.lastCheck,
      description: normalized.description,
      address: address || null,
      latitude: hasCoords ? latitude : null,
      longitude: hasCoords ? longitude : null,
    },
  }
}

function toApiRow(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    severity: row.severity,
    status: row.status,
    lastCheck: row.last_check instanceof Date ? row.last_check.toISOString().slice(0, 10) : row.last_check,
    description: row.description,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
  }
}

function normalizeEmail(email) {
  return normalizeString(email).toLowerCase()
}

function validateRegisterPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { error: 'Invalid JSON body' }
  }

  const name = normalizeString(payload.name)
  const email = normalizeEmail(payload.email)
  const password = normalizeString(payload.password)

  const errors = []
  if (!name) errors.push('name is required')
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    errors.push('valid email is required')
  }
  if (!password || password.length < 6) {
    errors.push('password must be at least 6 characters')
  }

  if (errors.length > 0) {
    return { error: errors.join(', ') }
  }

  return { value: { name, email, password } }
}

function validateLoginPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { error: 'Invalid JSON body' }
  }

  const email = normalizeEmail(payload.email)
  const password = normalizeString(payload.password)
  if (!email || !password) {
    return { error: 'email and password are required' }
  }

  return { value: { email, password } }
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL },
  )
}

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : null

  if (!token) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET)
    next()
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' })
  }
}

// Liveness — process is up
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() })
})

// Readiness — DB is reachable too
app.get('/api/ready', async (req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ status: 'ready' })
  } catch (error) {
    res.status(503).json({ status: 'unavailable', error: error.message })
  }
})

app.post('/api/auth/register', authLimiter, async (req, res, next) => {
  const { error, value } = validateRegisterPayload(req.body)
  if (error) {
    res.status(400).json({ error })
    return
  }

  try {
    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [value.email],
    )
    if (existing.rowCount > 0) {
      res.status(409).json({ error: 'Email already registered' })
      return
    }

    const passwordHash = await bcrypt.hash(value.password, 10)
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, created_at`,
      [value.name, value.email, passwordHash],
    )
    const user = result.rows[0]
    const token = signToken(user)

    res.status(201).json({ token, user })
  } catch (error) {
    next(error)
  }
})

app.post('/api/auth/login', authLimiter, async (req, res, next) => {
  const { error, value } = validateLoginPayload(req.body)
  if (error) {
    res.status(400).json({ error })
    return
  }

  try {
    const result = await pool.query(
      `SELECT id, name, email, password_hash
       FROM users
       WHERE email = $1`,
      [value.email],
    )

    if (result.rowCount === 0) {
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }

    const user = result.rows[0]
    const matches = await bcrypt.compare(value.password, user.password_hash)
    if (!matches) {
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }

    const token = signToken(user)
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } })
  } catch (error) {
    next(error)
  }
})

app.get('/api/infrastructures', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, name, type, severity, status, last_check, description, address, latitude, longitude
       FROM infrastructures
       ORDER BY id`,
    )
    res.json(result.rows.map(toApiRow))
  } catch (error) {
    next(error)
  }
})

app.get('/api/infrastructures/:id', async (req, res, next) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }

  try {
    const result = await pool.query(
      `SELECT id, name, type, severity, status, last_check, description, address, latitude, longitude
       FROM infrastructures
       WHERE id = $1`,
      [id],
    )
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.json(toApiRow(result.rows[0]))
  } catch (error) {
    next(error)
  }
})

app.post('/api/infrastructures', writeLimiter, authenticate, async (req, res, next) => {
  const { error, value } = validatePayload(req.body)
  if (error) {
    res.status(400).json({ error })
    return
  }

  try {
    const result = await pool.query(
      `INSERT INTO infrastructures (name, type, severity, status, last_check, description, address, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, name, type, severity, status, last_check, description, address, latitude, longitude`,
      [
        value.name,
        value.type,
        value.severity,
        value.status,
        value.lastCheck,
        value.description,
        value.address,
        value.latitude,
        value.longitude,
      ],
    )
    res.status(201).json(toApiRow(result.rows[0]))
  } catch (error) {
    next(error)
  }
})

app.put('/api/infrastructures/:id', writeLimiter, authenticate, async (req, res, next) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }

  const { error, value } = validatePayload(req.body)
  if (error) {
    res.status(400).json({ error })
    return
  }

  try {
    const result = await pool.query(
      `UPDATE infrastructures
       SET name = $1,
           type = $2,
           severity = $3,
           status = $4,
           last_check = $5,
           description = $6,
           address = $7,
           latitude = $8,
           longitude = $9
       WHERE id = $10
       RETURNING id, name, type, severity, status, last_check, description, address, latitude, longitude`,
      [
        value.name,
        value.type,
        value.severity,
        value.status,
        value.lastCheck,
        value.description,
        value.address,
        value.latitude,
        value.longitude,
        id,
      ],
    )

    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Not found' })
      return
    }

    res.json(toApiRow(result.rows[0]))
  } catch (error) {
    next(error)
  }
})

app.delete('/api/infrastructures/:id', writeLimiter, authenticate, async (req, res, next) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }

  try {
    const result = await pool.query('DELETE FROM infrastructures WHERE id = $1', [id])
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.status(204).send()
  } catch (error) {
    next(error)
  }
})

// 404 for unknown /api/* — keep SPA fallback as nginx's job
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// Error handler — never leak stack traces in prod
app.use((error, req, res, next) => {
  console.error('[api error]', error)
  res.status(error.status || 500).json({
    error: isProd ? 'Internal server error' : (error.message || 'Internal server error'),
  })
})

async function start() {
  await ensureSchema()
  if ((process.env.AUTO_SEED ?? 'true') === 'true') {
    try {
      const inserted = await seedIfEmpty()
      if (inserted > 0) console.log(`[seed] inserted ${inserted} infrastructures`)
    } catch (error) {
      console.error('[seed] failed:', error.message)
      // not fatal — the table just stays empty
    }
  }

  const server = app.listen(port, () => {
    console.log(`[api] listening on :${port} (${NODE_ENV})`)
  })

  // Graceful shutdown so docker stop / systemctl stop don't drop in-flight requests
  const shutdown = async (signal) => {
    console.log(`[api] received ${signal}, shutting down`)
    server.close(async () => {
      try { await pool.end() } catch {}
      process.exit(0)
    })
    setTimeout(() => {
      console.error('[api] force exit after 10s')
      process.exit(1)
    }, 10_000).unref()
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

start().catch((error) => {
  console.error('[api] failed to start:', error)
  process.exit(1)
})
