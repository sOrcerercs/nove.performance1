import { eq } from 'drizzle-orm'
import { expect, test } from 'vitest'
import type { SessionUser } from '@/lib/auth/permissions'
import { createTestDb, type Db } from '@/lib/db'
import { objectives } from '@/lib/db/schema'
import { seed } from '@/lib/db/seed'
import { SEED_OBJECTIVE_PERIOD_ID } from '@/lib/db/seed-data'
import type { Role } from '@/lib/domain/types'
import { setObjectiveWeightsFor } from '../core/objective-weights'

async function seeded() {
  const db = await createTestDb()
  await seed(db)
  return db
}

const actor = (role: Role): SessionUser => ({
  id: 'u-kagan.ozturk', name: 'Test', email: 't@nove.group', role, departmentId: null,
})

const input = (w1: number | null, w2: number | null) => ({
  departmentId: 'satis',
  periodId: SEED_OBJECTIVE_PERIOD_ID,
  weights: [
    { objectiveId: 'o-sat-1', weight: w1 },
    { objectiveId: 'o-sat-2', weight: w2 },
  ],
})

async function weightOf(db: Db, id: string) {
  const [row] = await db.select().from(objectives).where(eq(objectives.id, id))
  return row!.weight
}

test('an admin saves a set that adds up to 100', async () => {
  const db = await seeded()
  const res = await setObjectiveWeightsFor(db, actor('admin'), input(30, 70))
  expect(res).toEqual({ ok: true, data: { deptSlug: 'satis' } })
  expect(await weightOf(db, 'o-sat-1')).toBe(30)
  expect(await weightOf(db, 'o-sat-2')).toBe(70)
})

test('an executive may save weights', async () => {
  const db = await seeded()
  expect((await setObjectiveWeightsFor(db, actor('executive'), input(50, 50))).ok).toBe(true)
})

test('a staff record may not', async () => {
  const db = await seeded()
  const res = await setObjectiveWeightsFor(db, actor('staff'), input(50, 50))
  expect(res.ok).toBe(false)
  expect(await weightOf(db, 'o-sat-1')).toBeNull()
})

test('totals of 99.99 and 100.01 are refused with the total in both languages', async () => {
  const db = await seeded()
  for (const [a, b] of [[30, 69.99], [30, 70.01]] as const) {
    const res = await setObjectiveWeightsFor(db, actor('admin'), input(a, b))
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error.tr).toContain('%100 olmalı')
      expect(res.error.en).toContain('must add up to 100%')
    }
  }
  expect(await weightOf(db, 'o-sat-1')).toBeNull()
})

test('a partial set is refused', async () => {
  const res = await setObjectiveWeightsFor(await seeded(), actor('admin'), input(100, null))
  expect(res.ok).toBe(false)
  if (!res.ok) {
    expect(res.error.tr).toContain('ya her objective')
    expect(res.error.en).toContain('every objective, or for none')
  }
})

test('a weight out of range is refused', async () => {
  const res = await setObjectiveWeightsFor(await seeded(), actor('admin'), input(0, 100))
  expect(res.ok).toBe(false)
})

test('clearing every weight is allowed', async () => {
  const db = await seeded()
  await setObjectiveWeightsFor(db, actor('admin'), input(30, 70))
  const res = await setObjectiveWeightsFor(db, actor('admin'), input(null, null))
  expect(res.ok).toBe(true)
  expect(await weightOf(db, 'o-sat-1')).toBeNull()
  expect(await weightOf(db, 'o-sat-2')).toBeNull()
})

test('a list missing an objective is refused as stale (someone added one meanwhile)', async () => {
  const db = await seeded()
  const res = await setObjectiveWeightsFor(db, actor('admin'), {
    ...input(100, null),
    weights: [{ objectiveId: 'o-sat-1', weight: 100 }],
  })
  expect(res.ok).toBe(false)
  if (!res.ok) expect(res.error.en).toContain('reload the page')
  expect(await weightOf(db, 'o-sat-1')).toBeNull()
})

test("another department's objective in the list is refused as stale", async () => {
  const res = await setObjectiveWeightsFor(await seeded(), actor('admin'), {
    ...input(null, null),
    weights: [
      { objectiveId: 'o-sat-1', weight: 40 },
      { objectiveId: 'o-sat-2', weight: 30 },
      { objectiveId: 'o-pzr-1', weight: 30 },
    ],
  })
  expect(res.ok).toBe(false)
  if (!res.ok) expect(res.error.en).toContain('reload the page')
})

test('a duplicated objective id is refused as stale', async () => {
  const res = await setObjectiveWeightsFor(await seeded(), actor('admin'), {
    ...input(null, null),
    weights: [
      { objectiveId: 'o-sat-1', weight: 50 },
      { objectiveId: 'o-sat-1', weight: 50 },
    ],
  })
  expect(res.ok).toBe(false)
})

test('an unknown department is refused', async () => {
  const res = await setObjectiveWeightsFor(await seeded(), actor('admin'), { ...input(50, 50), departmentId: 'yok' })
  expect(res.ok).toBe(false)
})
