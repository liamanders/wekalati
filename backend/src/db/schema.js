import { pgEnum, pgTable, text, timestamp, uuid, integer, bigint } from 'drizzle-orm/pg-core'

export const roleEnum = pgEnum('user_role', ['supervisor', 'admin', 'user'])

export const agencies = pgTable('agencies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  location: text('location'),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  agencyId: uuid('agency_id').references(() => agencies.id, { onDelete: 'set null' }),
  role: roleEnum('role').notNull().default('user'),
  name: text('name').notNull(),
  nickname: text('nickname').notNull().default(''),
  phone: text('phone').notNull().default(''),
  shamcash: text('shamcash').notNull().default(''),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  tokenVersion: integer('token_version').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const deliveries = pgTable('deliveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  diamonds: bigint('diamonds', { mode: 'number' }).notNull(),
  screenshotPath: text('screenshot_path').notNull(),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }).notNull().defaultNow(),
})

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})
