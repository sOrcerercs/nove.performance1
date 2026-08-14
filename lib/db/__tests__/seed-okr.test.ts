import { expect, test } from 'vitest'
import { createTestDb } from '@/lib/db'
import { seed } from '@/lib/db/seed'
import { SEED_DEPARTMENTS, SEED_USERS, SEED_OBJECTIVE_PERIOD_CODE } from '@/lib/db/seed-data'
import { isMeasurable } from '@/lib/domain/progress'
import { allPeriods } from '@/lib/queries/tables'
import { loadTree, allKrs } from '@/lib/queries/tree'
import { withRequestScope } from '@/lib/queries/tables'

const KRS = SEED_DEPARTMENTS.flatMap((d) => d.objectives.flatMap((o) => o.krs))

test('the workbook lands as 10 departments, 26 objectives and 63 key results', () => {
  expect(SEED_DEPARTMENTS).toHaveLength(10)
  expect(SEED_DEPARTMENTS.flatMap((d) => d.objectives)).toHaveLength(26)
  expect(KRS).toHaveLength(63)
})

test('every key result starts at zero progress', () => {
  // Excel carried actuals for 40 of them; they were deliberately not imported so
  // the whole company starts from the same place.
  for (const kr of KRS) expect(kr.current, kr.id).toBe(kr.start)
})

test('the rollup rules match the agreed distribution', () => {
  const count = (r: string) => KRS.filter((k) => k.rollup === r).length
  expect(count('sum')).toBe(14)
  expect(count('avg')).toBe(37)
  expect(count('last')).toBe(12)
})

test('exactly two key results are unmeasurable, and they are the known two', () => {
  const unmeasurable = KRS.filter((k) => !isMeasurable(k)).map((k) => k.id).sort()
  expect(unmeasurable).toEqual(['k-hop-anket-genel', 'k-mkt-cpl'])
})

/**
 * Five corrections were made by hand against the source workbook (see the
 * comments beside each in seed-data.ts). Two of them (`k-mkt-cpl`,
 * `k-hop-anket-genel`) turn the key result unmeasurable and are already
 * pinned above; the other three are pinned here so a "helpful" revert of one
 * — restoring the Excel-original values — fails loudly instead of silently.
 */
test('the three remaining data corrections keep their corrected values', () => {
  const byId = Object.fromEntries(KRS.map((k) => [k.id, k]))

  // Excel read "%7,5 artış"; the user clarified it is the arrival rate, not a
  // delta, so start stays 0 and target is the rate itself.
  expect(byId['k-mkt-cro']).toMatchObject({ start: 0, target: 7.5, unit: '%' })

  // "$35,000 per season" — target corrected to the season figure.
  expect(byId['k-fin-tedarik']).toMatchObject({ target: 35000 })

  // Excel's 110%/target 100% was a ceiling, not a reduction goal as stored;
  // corrected to a real reduction: start 110, target 100.
  expect(byId['k-hop-sarf']).toMatchObject({ start: 110, target: 100, unit: '%' })
})

test('percentage key results carry the percent unit and human-scale values', () => {
  for (const kr of KRS.filter((k) => k.unit === '%')) {
    expect(kr.target, kr.id).toBeLessThanOrEqual(110)
    expect(kr.start, kr.id).toBeLessThanOrEqual(110)
  }
})

test('nobody owns anything yet, and there are exactly three accounts', () => {
  expect(SEED_USERS).toHaveLength(3)
  expect(SEED_USERS.every((u) => u.role === 'admin')).toBe(true)
  for (const kr of KRS) expect(kr.owner, kr.id).toBe('')
})

test('every objective is attached to the open fiscal year and the company reads 0%', async () => {
  const db = await createTestDb()
  await seed(db)

  const vm = await withRequestScope(async () => {
    const ids = (await allPeriods(db))
      .filter((p) => p.code === SEED_OBJECTIVE_PERIOD_CODE)
      .map((p) => p.id)
    return loadTree(db, ids)
  })

  expect(vm.depts).toHaveLength(10)
  expect(allKrs(vm.depts)).toHaveLength(63)
})
