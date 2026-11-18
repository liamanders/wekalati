import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { agencies, users } from '../db/schema.js'

export async function login(req, res, next) {
  try {
    const { email, password } = req.body
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }
    const [user] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1)
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Email or password is incorrect' })
    }
    if (user.role !== 'supervisor') {
      if (!user.agencyId) return res.status(403).json({ error: 'This account is not assigned to an active agency' })
      const [agency] = await db.select({ archivedAt: agencies.archivedAt })
        .from(agencies).where(eq(agencies.id, user.agencyId)).limit(1)
      if (!agency || agency.archivedAt) return res.status(403).json({ error: 'This agency is archived' })
    }
    if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET must be set')
    const token = jwt.sign({ sub: user.id, tokenVersion: user.tokenVersion }, process.env.JWT_SECRET, { expiresIn: '12h' })
    const { passwordHash, ...profile } = user
    return res.json({ token, user: profile })
  } catch (error) {
    next(error)
  }
}
