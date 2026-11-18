import bcrypt from 'bcryptjs'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { agencies, deliveries, users } from '../db/schema.js'

function agencyScope(auth, userId) {
  const conditions = [eq(users.id, userId)]
  if (auth.role !== 'supervisor') conditions.push(eq(users.agencyId, auth.agencyId))
  return and(...conditions)
}

export async function listUsers(req, res, next) {
  try {
    const conditions = []
    if (req.auth.role === 'user') conditions.push(eq(users.id, req.auth.sub))
    else if (req.auth.role !== 'supervisor') conditions.push(eq(users.agencyId, req.auth.agencyId))
    if (req.query.agencyId && req.auth.role === 'supervisor') conditions.push(eq(users.agencyId, req.query.agencyId))
    const result = await db.select({
      id: users.id, agencyId: users.agencyId, role: users.role, name: users.name, nickname: users.nickname,
      phone: users.phone, shamcash: users.shamcash, email: users.email, createdAt: users.createdAt,
      diamonds: sql`coalesce(sum(${deliveries.diamonds}), 0)::bigint`,
      deliveryCount: sql`count(${deliveries.id})::int`,
    }).from(users).leftJoin(deliveries, eq(deliveries.userId, users.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .groupBy(users.id).orderBy(desc(users.createdAt))
    return res.json(result)
  } catch (error) {
    next(error)
  }
}

export async function createUser(req, res, next) {
  try {
    const { name, email, password, agencyId, phone = '', nickname = '', shamcash = '', role = 'user' } = req.body
    if (![name, email, password].every((value) => typeof value === 'string' && value.trim())) {
      return res.status(400).json({ error: 'Name, email, and password are required' })
    }
    if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: 'Role must be admin or user' })
    if (req.auth.role === 'admin' && role !== 'user') return res.status(403).json({ error: 'Admins can only create users' })
    if (password.length < 12) return res.status(400).json({ error: 'Password must be at least 12 characters' })
    const scopedAgencyId = req.auth.role === 'supervisor' ? agencyId : req.auth.agencyId
    if (!scopedAgencyId) return res.status(400).json({ error: 'An agency must be assigned' })
    const [agency] = await db.select({ id: agencies.id }).from(agencies)
      .where(and(eq(agencies.id, scopedAgencyId), isNull(agencies.archivedAt))).limit(1)
    if (!agency) return res.status(404).json({ error: 'Active agency not found' })
    const passwordHash = await bcrypt.hash(password, 12)
    const [created] = await db.insert(users).values({
      name: name.trim(), email: email.trim().toLowerCase(), passwordHash, agencyId: scopedAgencyId,
      phone: String(phone), nickname: String(nickname), shamcash: String(shamcash), role,
    }).returning({
      id: users.id, agencyId: users.agencyId, role: users.role, name: users.name, nickname: users.nickname,
      phone: users.phone, shamcash: users.shamcash, email: users.email,
    })
    return res.status(201).json(created)
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'An account with this email already exists' })
    next(error)
  }
}

export async function updateUser(req, res, next) {
  try {
    const isSelf = req.auth.sub === req.params.id
    if (req.auth.role === 'user' && !isSelf) return res.status(403).json({ error: 'You can only edit your own profile' })
    const userCondition = agencyScope(req.auth, req.params.id)
    const [existing] = await db.select({ id: users.id }).from(users).where(userCondition).limit(1)
    if (!existing) return res.status(404).json({ error: 'User not found' })
    const changes = req.auth.role === 'user'
      ? { nickname: String(req.body.nickname ?? ''), shamcash: String(req.body.shamcash ?? '') }
      : { name: req.body.name, phone: req.body.phone, nickname: req.body.nickname, shamcash: req.body.shamcash }
    for (const key of Object.keys(changes)) if (changes[key] === undefined) delete changes[key]
    const [updated] = await db.update(users).set(changes).where(userCondition).returning({
      id: users.id, agencyId: users.agencyId, role: users.role, name: users.name, nickname: users.nickname,
      phone: users.phone, shamcash: users.shamcash, email: users.email,
    })
    return res.json(updated)
  } catch (error) {
    next(error)
  }
}

export async function resetUserPassword(req, res, next) {
  try {
    const password = req.body?.password
    if (typeof password !== 'string' || password.length < 12) {
      return res.status(400).json({ error: 'Password must be at least 12 characters' })
    }
    const [account] = await db.select({
      id: users.id,
      role: users.role,
      agencyId: users.agencyId,
    }).from(users).where(eq(users.id, req.params.id)).limit(1)
    if (!account || !['admin', 'user'].includes(account.role)) {
      return res.status(404).json({ error: 'Admin or user account not found' })
    }
    if (!account.agencyId) return res.status(400).json({ error: 'This account is not assigned to an active agency' })
    const [agency] = await db.select({ id: agencies.id }).from(agencies)
      .where(and(eq(agencies.id, account.agencyId), isNull(agencies.archivedAt))).limit(1)
    if (!agency) return res.status(400).json({ error: 'Archived agency accounts cannot be reset' })
    const passwordHash = await bcrypt.hash(password, 12)
    await db.update(users)
      .set({ passwordHash, tokenVersion: sql`${users.tokenVersion} + 1` })
      .where(eq(users.id, account.id))
    return res.status(204).end()
  } catch (error) {
    next(error)
  }
}

export async function deleteUser(req, res, next) {
  try {
    const condition = agencyScope(req.auth, req.params.id)
    const [target] = await db.select({ id: users.id, role: users.role })
      .from(users).where(condition).limit(1)
    if (!target) return res.status(404).json({ error: 'User not found' })
    if (target.role === 'supervisor') return res.status(403).json({ error: 'Supervisor accounts cannot be deleted here' })
    if (req.auth.role === 'admin' && target.role !== 'user') {
      return res.status(403).json({ error: 'Admins can only delete users' })
    }
    const [deleted] = await db.delete(users).where(condition).returning({ id: users.id })
    if (!deleted) return res.status(404).json({ error: 'User not found' })
    return res.status(204).end()
  } catch (error) {
    next(error)
  }
}
