import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { pool, ensureSchema } from './db.js'

const app = express()
const port = Number(process.env.PORT || 3001)
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret'
const TOKEN_TTL = '2h'

app.use(cors())
app.use(express.json())

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

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

app.post('/api/auth/register', async (req, res, next) => {
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

app.post('/api/auth/login', async (req, res, next) => {
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

app.post('/api/infrastructures', authenticate, async (req, res, next) => {
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

app.put('/api/infrastructures/:id', authenticate, async (req, res, next) => {
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

app.delete('/api/infrastructures/:id', authenticate, async (req, res, next) => {
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

app.use((error, req, res, next) => {
  console.error(error)
  res.status(500).json({ error: 'Internal server error' })
})

await ensureSchema()

app.listen(port, () => {
  console.log(`API listening on port ${port}`)
})
