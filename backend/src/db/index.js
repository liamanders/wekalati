import 'dotenv/config'
import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from './schema.js'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set')
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
pool.on('error', (error) => console.error('Unexpected PostgreSQL pool error', error))

export const db = drizzle(pool, { schema })
export { pool }
