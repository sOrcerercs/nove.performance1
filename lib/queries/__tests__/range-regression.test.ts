import { expect, test } from 'vitest'
import { createTestDb } from '@/lib/db'
import { seed } from '@/lib/db/seed'
import { SEED_OBJECTIVE_PERIOD_CODE } from '@/lib/db/seed-data'
import { getOverview } from '../overview'
import { resolveRange } from '../range'
import { getReport } from '../report'
import { allPeriods, withRequestScope } from '../tables'

async function seeded() {
  const db = await createTestDb()
  await seed(db)
  return db
}

/**
 * The invariant that makes this change safe to ship: selecting exactly one
 * quarter's span must reproduce the numbers that quarter showed before ranges
 * existed. The seeded overview is 0% company-wide with 63 key results; 61 of
 * them are measurable and open to development (nothing has been measured
 * yet), the other 2 are unmeasurable (start === target) and excluded from
 * both totals; those are the pre-range figures.
 */
test('a range equal to one quarter reproduces that quarter numbers', async () => {
  const db = await seeded()

  const { vm, report } = await withRequestScope(async () => {
    const quarter = (await allPeriods(db)).find((p) => p.code === SEED_OBJECTIVE_PERIOD_CODE)
    if (!quarter) throw new Error('seed has no open quarter')

    const selection = await resolveRange(db, { from: quarter.startsOn, to: quarter.endsOn })
    expect(selection.periods.map((p) => p.code)).toEqual([SEED_OBJECTIVE_PERIOD_CODE])

    const ids = selection.periods.map((p) => p.id)
    return { vm: await getOverview(db, ids), report: await getReport(db, ids) }
  })

  expect(vm.companyPct).toBe(0)
  expect(vm.kpis).toEqual({ depts: 10, objectives: 26, krs: 63, measuredKrs: 63, avgPct: 0, openKrs: 61 })
  expect(report.totals).toEqual({ objectives: 26, krs: 63, openKrs: 61, companyPct: 0 })
  expect(report.periodCodes).toEqual([SEED_OBJECTIVE_PERIOD_CODE])
})

test('the two unmeasurable key results do not drag any department down', async () => {
  const db = await seeded()
  const vm = await withRequestScope(async () => {
    const ids = (await allPeriods(db))
      .filter((p) => p.code === SEED_OBJECTIVE_PERIOD_CODE)
      .map((p) => p.id)
    return getOverview(db, ids)
  })

  // Every objective is at 0% because no actuals are in yet — but that must be a
  // real zero, not NaN, and not an artefact of dividing by an unmeasurable row.
  expect(vm.companyPct).toBe(0)
  expect(Number.isFinite(vm.companyPct)).toBe(true)
  for (const d of vm.depts) expect(Number.isFinite(d.pct), d.slug).toBe(true)
})

test('an empty range renders empty rather than throwing', async () => {
  const db = await seeded()
  const vm = await withRequestScope(async () => {
    const selection = await resolveRange(db, { from: '1999-01-01', to: '1999-12-31' })
    return getOverview(
      db,
      selection.periods.map((p) => p.id),
    )
  })

  expect(vm.kpis.objectives).toBe(0)
  expect(vm.kpis.krs).toBe(0)
  expect(vm.companyPct).toBe(0)
})
