import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { db, pool } from './db/index.js'
import { users } from './db/schema.js'

async function seedSupervisor() {
  const { SUPERVISOR_NAME, SUPERVISOR_EMAIL, SUPERVISOR_PASSWORD } = process.env
  if (!SUPERVISOR_NAME || !SUPERVISOR_EMAIL || !SUPERVISOR_PASSWORD || SUPERVISOR_PASSWORD.length < 12) {
    throw new Error('Set SUPERVISOR_NAME, SUPERVISOR_EMAIL, and a SUPERVISOR_PASSWORD of at least 12 characters')
  }
  const email = SUPERVISOR_EMAIL.trim().toLowerCase()
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  if (existing) throw new Error(`An account already exists for ${email}`)
  const [created] = await db.insert(users).values({
    name: SUPERVISOR_NAME.trim(),
    email,
    role: 'supervisor',
    passwordHash: await bcrypt.hash(SUPERVISOR_PASSWORD, 12),
  }).returning({ id: users.id, email: users.email })
  console.log(`Created supervisor ${created.email} (${created.id})`)
}

try {
  await seedSupervisor()
} finally {
  await pool.end()
}
