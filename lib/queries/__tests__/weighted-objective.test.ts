import { expect, test } from 'vitest'
import type { SessionUser } from '@/lib/auth/permissions'
import { createTestDb } from '@/lib/db'
import { seed } from '@/lib/db/seed'
import { SEED_OBJECTIVE_PERIOD_CODE } from '@/lib/db/seed-data'
import { createObjectiveFor } from '@/lib/actions/core/objectives'
import { setMonthlyValueAs } from '@/lib/actions/core/monthly'
import { M1, M2 } from '@/lib/actions/__tests__/open-months'
import { getDepartment } from '@/lib/queries/department'
import { allPeriods } from '@/lib/queries/tables'
import { keyResults } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const admin: SessionUser = { id: 'u-kagan.ozturk', name: 'Test', email: 't@nove.group', role: 'admin', departmentId: null }

async function setup() {
  const db = await createTestDb()
  await seed(db)
  const res = await createObjectiveFor(db, admin, {
    title: 'Ağırlıklı hedef',
    departmentId: 'satis',
    ownerUserId: null,
    periodCode: SEED_OBJECTIVE_PERIOD_CODE,
    krs: [
      { title: 'Birinci KR', start: 0, target: 100, unit: '', rollup: 'last' as const, weight: 75 },
      { title: 'İkinci KR', start: 0, target: 100, unit: '', rollup: 'last' as const, weight: 25 },
    ],
  })
  if (!res.ok) throw new Error('create failed')
  const krs = await db.select().from(keyResults).where(eq(keyResults.objectiveId, res.data.id))
  const k1 = krs.find((k) => k.titleTr === 'Birinci KR')!
  const k2 = krs.find((k) => k.titleTr === 'İkinci KR')!
  const ids = (await allPeriods(db)).filter((p) => p.code === SEED_OBJECTIVE_PERIOD_CODE).map((p) => p.id)
  return { db, res, k1, k2, ids }
}

test("an objective's pct is the weighted average of its key results", async () => {
  const { db, res, k1, k2, ids } = await setup()
  await setMonthlyValueAs(db, admin, { krId: k1.id, month: M1, value: 80 })
  await setMonthlyValueAs(db, admin, { krId: k2.id, month: M1, value: 0 })
  const dept = await getDepartment(db, 'satis', ids)
  expect(dept?.objectives.find((o) => o.id === res.data.id)?.pct).toBe(60)
})

test('under a cutoff, a key result with no data yet drops out of the weighted average', async () => {
  const { db, res, k1, k2, ids } = await setup()
  await setMonthlyValueAs(db, admin, { krId: k2.id, month: M1, value: 40 })
  await setMonthlyValueAs(db, admin, { krId: k1.id, month: M2, value: 80 })
  const dept = await getDepartment(db, 'satis', ids, `${M1}-15`)
  expect(dept?.objectives.find((o) => o.id === res.data.id)?.pct).toBe(40)
})
