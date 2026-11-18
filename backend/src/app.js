import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import routes from './routes/index.js'

const app = express()
const allowedOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

app.use(cors({ origin: allowedOrigins }))
app.use(express.json({ limit: '1mb' }))
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))
app.use('/api', routes)
app.use((error, _req, res, _next) => {
  console.error(error)
  if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Screenshot must be 4 MB or smaller' })
  if (error.message?.startsWith('Screenshot must be')) return res.status(400).json({ error: error.message })
  return res.status(500).json({ error: 'An unexpected server error occurred' })
})

export default app
