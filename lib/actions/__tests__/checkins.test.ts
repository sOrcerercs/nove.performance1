import { eq } from 'drizzle-orm'
import { expect, test } from 'vitest'
import type { SessionUser } from '@/lib/auth/permissions'
import { createTestDb } from '@/lib/db'
import { checkins, keyResults } from '@/lib/db/schema'
import { seed } from '@/lib/db/seed'
import type { Role } from '@/lib/domain/types'
import { submitCheckinFor } from '../core/checkins'

async function seeded() {
  const db = await createTestDb()
  await seed(db)
  return db
}

const actor = (role: Role, departmentId: string | null, id: string): SessionUser => ({
  id, name: 'Test', email: 't@nove.group', role, departmentId,
})

// k4 belongs to objective o-saha-1 in department 'saha', owned by Murat Şen —
// who is now a staff record, not an account.
const K4_OWNER = 'u-murat.sen'
const ADMIN = 'u-elif.cinar'

test('an admin can check in, and the value moves', async () => {
  const db = await seeded()
  const res = await submitCheckinFor(db, actor('admin', 'ik', ADMIN), {
    keyResultId: 'k4',
    newValue: 57,
    confidence: 'high',
    note: 'Bu hafta iki yeni süreç devreye alındı.',
  })

  expect(res.ok).toBe(true)
  if (!res.ok) return
  // k4: start 41, target 60. (57-41)/(60-41) = 84%.
  expect(res.data.pct).toBe(84)
  expect(res.data.previousValue).toBe(54)

  const [kr] = await db.select().from(keyResults).where(eq(keyResults.id, 'k4'))
  expect(kr?.current).toBe(57)
  expect(kr?.confidence).toBe('high')
})

test('an audit row records who changed what, from what value', async () => {
  const db = await seeded()
  await submitCheckinFor(db, actor('admin', 'ik', ADMIN), {
    keyResultId: 'k4', newValue: 57, confidence: 'high', note: 'Not',
  })

  const rows = await db.select().from(checkins).where(eq(checkins.keyResultId, 'k4'))
  expect(rows).toHaveLength(1)
  expect(rows[0]?.previousValue).toBe(54)
  expect(rows[0]?.newValue).toBe(57)
  expect(rows[0]?.authorUserId).toBe(ADMIN)
  expect(rows[0]?.note).toBe('Not')
})

test('an admin checks in across departments, not just their own', async () => {
  const db = await seeded()
  // The admin sits in 'ik'; k4 is in 'saha'.
  const res = await submitCheckinFor(db, actor('admin', 'ik', ADMIN), {
    keyResultId: 'k4', newValue: 60, confidence: 'high',
  })
  expect(res.ok).toBe(true)
  if (res.ok) expect(res.data.pct).toBe(100)
})

test('an executive cannot check in — oversight is read-only', async () => {
  const db = await seeded()
  const res = await submitCheckinFor(db, actor('executive', null, 'u-genel.mudurluk'), {
    keyResultId: 'k4', newValue: 57, confidence: 'high',
  })
  expect(res.ok).toBe(false)

  const [kr] = await db.select().from(keyResults).where(eq(keyResults.id, 'k4'))
  expect(kr?.current).toBe(54) // unchanged
  expect(await db.select().from(checkins)).toHaveLength(0)
})

test('a staff record cannot check in, even on a key result they own', async () => {
  const db = await seeded()
  const res = await submitCheckinFor(db, actor('staff', 'saha', K4_OWNER), {
    keyResultId: 'k4', newValue: 57, confidence: 'high',
  })
  expect(res.ok).toBe(false)
  expect(await db.select().from(checkins)).toHaveLength(0)
})

test('an unknown key result is rejected', async () => {
  const db = await seeded()
  const res = await submitCheckinFor(db, actor('admin', null, ADMIN), {
    keyResultId: 'nope', newValue: 1, confidence: 'mid',
  })
  expect(res.ok).toBe(false)
})

test('a non-finite value is rejected before touching the database', async () => {
  const db = await seeded()
  const res = await submitCheckinFor(db, actor('admin', null, ADMIN), {
    keyResultId: 'k4', newValue: Number.NaN, confidence: 'mid',
  })
  expect(res.ok).toBe(false)
  expect(await db.select().from(checkins)).toHaveLength(0)
})
