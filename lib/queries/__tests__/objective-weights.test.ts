import { eq } from 'drizzle-orm'
import { expect, test } from 'vitest'
import { createTestDb } from '@/lib/db'
import { objectives } from '@/lib/db/schema'
import { seed } from '@/lib/db/seed'
import { SEED_OBJECTIVE_PERIOD_ID } from '@/lib/db/seed-data'
import { loadTree } from '../tree'
import { setMonthlyValueAs } from '@/lib/actions/core/monthly'
import { M1 } from '@/lib/actions/__tests__/open-months'
import type { SessionUser } from '@/lib/auth/permissions'
import { getDepartment } from '../department'
import { getOverview } from '../overview'
import { getReport } from '../report'
import { getSidebarData } from '../sidebar'

async function seeded() {
  const db = await createTestDb()
  await seed(db)
  return db
}

test('loadTree carries each objective weight', async () => {
  const db = await seeded()
  await db.update(objectives).set({ weight: 40 }).where(eq(objectives.id, 'o-sat-1'))
  const { depts } = await loadTree(db, [SEED_OBJECTIVE_PERIOD_ID])
  const satis = depts.find((d) => d.slug === 'satis')!
  expect(satis.objectives.find((o) => o.id === 'o-sat-1')!.weight).toBe(40)
  expect(satis.objectives.find((o) => o.id === 'o-sat-2')!.weight).toBeNull()
})

const admin: SessionUser = { id: 'u-kagan.ozturk', name: 'Test', email: 't@nove.group', role: 'admin', departmentId: null }

/**
 * Satış has two objectives in the open period. k-sat-premium (0 → 8) at 8
 * puts o-sat-2 at 50% (its other key result stays at 0%); o-sat-1 stays 0%.
 * Plain mean 25; weighted 30/70 → 35.
 */
async function weightedSatis() {
  const db = await seeded()
  const res = await setMonthlyValueAs(db, admin, { krId: 'k-sat-premium', month: M1, value: 8 })
  if (!res.ok) throw new Error('monthly write failed')
  return db
}

test('the department page reads the weighted percentage and each objective weight', async () => {
  const db = await weightedSatis()
  const ids = [SEED_OBJECTIVE_PERIOD_ID]
  expect((await getDepartment(db, 'satis', ids))!.pct).toBe(25)

  await db.update(objectives).set({ weight: 30 }).where(eq(objectives.id, 'o-sat-1'))
  await db.update(objectives).set({ weight: 70 }).where(eq(objectives.id, 'o-sat-2'))
  const dept = (await getDepartment(db, 'satis', ids))!
  expect(dept.pct).toBe(35)
  expect(dept.id).toBe('satis')
  expect(dept.objectives.find((o) => o.id === 'o-sat-2')!.weight).toBe(70)
  expect(dept.objectives.find((o) => o.id === 'o-sat-2')!.periodId).toBe(SEED_OBJECTIVE_PERIOD_ID)
  expect(dept.periods).toEqual([
    { id: SEED_OBJECTIVE_PERIOD_ID, code: expect.any(String), weightState: 'complete' },
  ])
})

test('sidebar, report and overview agree with the department page', async () => {
  const db = await weightedSatis()
  await db.update(objectives).set({ weight: 30 }).where(eq(objectives.id, 'o-sat-1'))
  await db.update(objectives).set({ weight: 70 }).where(eq(objectives.id, 'o-sat-2'))
  const ids = [SEED_OBJECTIVE_PERIOD_ID]

  expect((await getSidebarData(db, ids)).pctBySlug['satis']).toBe(35)
  expect((await getReport(db, ids)).rows.find((r) => r.slug === 'satis')!.pct).toBe(35)
  expect((await getOverview(db, ids)).depts.find((d) => d.slug === 'satis')!.pct).toBe(35)
})

test('a set broken by a removed weight reports incomplete and falls back to the plain mean', async () => {
  const db = await weightedSatis()
  await db.update(objectives).set({ weight: 30 }).where(eq(objectives.id, 'o-sat-1'))
  const dept = (await getDepartment(db, 'satis', [SEED_OBJECTIVE_PERIOD_ID]))!
  expect(dept.pct).toBe(25)
  expect(dept.periods[0]!.weightState).toBe('incomplete')
})

test('an unweighted department reports none', async () => {
  const dept = (await getDepartment(await seeded(), 'satis', [SEED_OBJECTIVE_PERIOD_ID]))!
  expect(dept.periods[0]!.weightState).toBe('none')
})
