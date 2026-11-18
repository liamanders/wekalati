import bcrypt from 'bcryptjs'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { agencies, deliveries, users } from '../db/schema.js'

export async function listAgencies(req, res, next) {
  try {
    const result = await db.select({
      id: agencies.id,
      name: agencies.name,
      location: agencies.location,
      archivedAt: agencies.archivedAt,
      createdAt: agencies.createdAt,
      members: sql`count(distinct case when ${users.role} = 'user' then ${users.id} end)::int`,
      admins: sql`count(distinct case when ${users.role} = 'admin' then ${users.id} end)::int`,
      diamonds: sql`coalesce(sum(${deliveries.diamonds}), 0)::bigint`,
    }).from(agencies)
      .leftJoin(users, eq(users.agencyId, agencies.id))
      .leftJoin(deliveries, eq(deliveries.userId, users.id))
      .where(and(
        req.auth.role === 'supervisor' && req.query.includeArchived !== 'true' ? isNull(agencies.archivedAt) : undefined,
        req.auth.role !== 'supervisor' ? eq(agencies.id, req.auth.agencyId) : undefined,
      ))
      .groupBy(agencies.id)
      .orderBy(desc(agencies.createdAt))
    return res.json(result)
  } catch (error) {
    next(error)
  }
}

export async function createAgency(req, res, next) {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
    const admin = req.body.admin
    if (!name) return res.status(400).json({ error: 'Agency name is required' })
    if (!admin || ![admin.name, admin.email, admin.password].every((value) => typeof value === 'string' && value.trim())) {
      return res.status(400).json({ error: 'Admin name, email, and password are required' })
    }
    if (admin.password.length < 12) return res.status(400).json({ error: 'Admin password must be at least 12 characters' })
    const email = admin.email.trim().toLowerCase()
    const passwordHash = await bcrypt.hash(admin.password, 12)
    const agency = await db.transaction(async (tx) => {
      const [createdAgency] = await tx.insert(agencies)
        .values({ name, location: typeof req.body.location === 'string' ? req.body.location.trim() || null : null })
        .returning()
      await tx.insert(users).values({
        agencyId: createdAgency.id,
        role: 'admin',
        name: admin.name.trim(),
        email,
        phone: typeof admin.phone === 'string' ? admin.phone.trim() : '',
        passwordHash,
      })
      return createdAgency
    })
    return res.status(201).json(agency)
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'An account with this admin email already exists' })
    next(error)
  }
}

export async function updateAgency(req, res, next) {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
    if (!name) return res.status(400).json({ error: 'Agency name is required' })
    const [agency] = await db.update(agencies).set({ name, location: req.body.location?.trim() || null })
      .where(and(eq(agencies.id, req.params.id), isNull(agencies.archivedAt))).returning()
    if (!agency) return res.status(404).json({ error: 'Agency not found' })
    return res.json(agency)
  } catch (error) {
    next(error)
  }
}

export async function deleteAgency(req, res, next) {
  try {
    const [agency] = await db.update(agencies).set({ archivedAt: new Date() })
      .where(and(eq(agencies.id, req.params.id), isNull(agencies.archivedAt)))
      .returning({ id: agencies.id })
    if (!agency) return res.status(404).json({ error: 'Agency not found' })
    return res.status(204).end()
  } catch (error) {
    next(error)
  }
}
