import jwt from 'jsonwebtoken'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { agencies, users } from '../db/schema.js'

export async function requireAuth(req, res, next) {
  const secret = process.env.JWT_SECRET
  if (!secret) return res.status(500).json({ error: 'Authentication is not configured' })
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Authentication required' })
  let claims
  try {
    claims = jwt.verify(token, secret)
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' })
  }
  if (!claims || typeof claims.sub !== 'string' || !Number.isInteger(claims.tokenVersion)) {
    return res.status(401).json({ error: 'Invalid or expired session' })
  }
  try {
    const [account] = await db.select({
      id: users.id,
      role: users.role,
      agencyId: users.agencyId,
      tokenVersion: users.tokenVersion,
    }).from(users).where(eq(users.id, claims.sub)).limit(1)
    if (!account || account.tokenVersion !== claims.tokenVersion) {
      return res.status(401).json({ error: 'Invalid or expired session' })
    }
    if (account.role !== 'supervisor') {
      if (!account.agencyId) return res.status(403).json({ error: 'This account is not assigned to an active agency' })
      const [agency] = await db.select({ archivedAt: agencies.archivedAt })
        .from(agencies).where(eq(agencies.id, account.agencyId)).limit(1)
      if (!agency || agency.archivedAt) return res.status(403).json({ error: 'This agency is archived' })
    }
    req.auth = { ...claims, sub: account.id, role: account.role, agencyId: account.agencyId }
    return next()
  } catch (error) {
    return next(error)
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action' })
    }
    next()
  }
}
