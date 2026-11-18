import { and, desc, eq } from 'drizzle-orm'
import { del, get, put } from '@vercel/blob'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { db } from '../db/index.js'
import { deliveries, users } from '../db/schema.js'

const extensionByMimeType = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
}

async function storeScreenshot(file) {
  const filename = `${randomUUID()}${extensionByMimeType[file.mimetype]}`
  if (process.env.VERCEL) {
    const blob = await put(`deliveries/${filename}`, file.buffer, {
      access: 'private',
      contentType: file.mimetype,
    })
    return { path: `blob:${blob.pathname}`, blobPath: blob.pathname }
  }

  const filePath = path.resolve('uploads', filename)
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, file.buffer)
  return { path: `/uploads/${filename}` }
}

export async function listDeliveries(req, res, next) {
  try {
    const filters = []
    if (req.auth.role === 'user') filters.push(eq(deliveries.userId, req.auth.sub))
    else if (req.auth.role === 'admin') filters.push(eq(users.agencyId, req.auth.agencyId))
    if (req.params.userId) filters.push(eq(deliveries.userId, req.params.userId))
    const rows = await db.select({
      id: deliveries.id, userId: deliveries.userId, diamonds: deliveries.diamonds,
      deliveredAt: deliveries.deliveredAt,
    }).from(deliveries).innerJoin(users, eq(users.id, deliveries.userId))
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(deliveries.deliveredAt))
    return res.json(rows.map((row) => ({ ...row, screenshotUrl: `/api/deliveries/${row.id}/screenshot` })))
  } catch (error) {
    next(error)
  }
}

export async function createDelivery(req, res, next) {
  try {
    const diamonds = Number(req.body.diamonds)
    if (!Number.isSafeInteger(diamonds) || diamonds <= 0) return res.status(400).json({ error: 'Diamond amount must be a positive whole number' })
    if (!req.file) return res.status(400).json({ error: 'A screenshot is required to submit a delivery' })
    const screenshot = await storeScreenshot(req.file)
    let created
    try {
      const [row] = await db.insert(deliveries).values({
        userId: req.auth.sub,
        diamonds,
        screenshotPath: screenshot.path,
      }).returning({ id: deliveries.id, userId: deliveries.userId, diamonds: deliveries.diamonds, deliveredAt: deliveries.deliveredAt })
      created = row
    } catch (error) {
      if (screenshot.blobPath) {
        try {
          await del(screenshot.blobPath)
        } catch (cleanupError) {
          console.error('Unable to remove an orphaned delivery screenshot', cleanupError)
        }
      }
      throw error
    }
    return res.status(201).json({ ...created, screenshotUrl: `/api/deliveries/${created.id}/screenshot` })
  } catch (error) {
    next(error)
  }
}

export async function getDeliveryScreenshot(req, res, next) {
  try {
    const [delivery] = await db.select({
      userId: deliveries.userId,
      screenshotPath: deliveries.screenshotPath,
      agencyId: users.agencyId,
    }).from(deliveries).innerJoin(users, eq(users.id, deliveries.userId))
      .where(eq(deliveries.id, req.params.id)).limit(1)
    const canAccess = delivery && (
      req.auth.role === 'supervisor' ||
      (req.auth.role === 'admin' && delivery.agencyId === req.auth.agencyId) ||
      (req.auth.role === 'user' && delivery.userId === req.auth.sub)
    )
    if (!canAccess) return res.status(404).json({ error: 'Delivery screenshot not found' })
    if (delivery.screenshotPath.startsWith('blob:')) {
      const blob = await get(delivery.screenshotPath.slice('blob:'.length), { access: 'private' })
      if (!blob || blob.statusCode !== 200) return res.status(404).json({ error: 'Delivery screenshot not found' })
      res.setHeader('Content-Type', blob.blob.contentType)
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('Cache-Control', 'private, no-store')
      return Readable.fromWeb(blob.stream).pipe(res)
    }
    const filePath = path.resolve('uploads', path.basename(delivery.screenshotPath))
    return res.sendFile(filePath, { headers: { 'Cache-Control': 'private, no-store' } }, (error) => {
      if (!error) return
      if (error.code === 'ENOENT') return res.status(404).json({ error: 'Delivery screenshot not found' })
      next(error)
    })
  } catch (error) {
    next(error)
  }
}
