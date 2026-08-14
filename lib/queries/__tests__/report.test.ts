import { eq } from 'drizzle-orm'
import { expect, test } from 'vitest'
import { createTestDb, type Db } from '@/lib/db'
import { keyResults, krMonthlyValues } from '@/lib/db/schema'
import { seed } from '@/lib/db/seed'
import { SEED_OBJECTIVE_PERIOD_CODE } from '@/lib/db/seed-data'
import { monthsOfPeriod } from '@/lib/domain/monthly'
import { getReport } from '../report'
import { allPeriods } from '../tables'

async function idsOf(db: Db, codes: string[]) {
  const rows = await allPeriods(db)
  return rows.filter((p) => codes.includes(p.code)).map((p) => p.id)
}

async function report() {
  const db = await createTestDb()
  await seed(db)
  return getReport(db, await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE]))
}

async function seeded() {
  const db = await createTestDb()
  await seed(db)
  return db
}

/** The open seed period's own months, chronological — used to pick real
 *  months for monthly-value fixtures instead of hard-coding calendar dates
 *  that would drift out of the seed's fiscal year over time. */
async function openPeriodMonths(db: Db): Promise<string[]> {
  const rows = await allPeriods(db)
  const period = rows.find((p) => p.code === SEED_OBJECTIVE_PERIOD_CODE)
  if (!period) throw new Error('seed has no open period')
  return monthsOfPeriod(period.startsOn, period.endsOn)
}

const AUTHOR_USER_ID = 'u-kagan.ozturk'

/** A cutoff landing inside `month`, day immaterial (`loadTree` truncates it). */
const cutoffOf = (month: string): string => `${month}-15`

/**
 * `krPct` reports 0% for a key result whose start equals its target (there is
 * no distance to cover), which is exactly the "Gelişime Açık" band the
 * executive report ranks worst-first. Left unfixed, the two deliberately
 * unmeasurable rows (k-mkt-cpl, k-hop-anket-genel) would sit at the very top
 * of "where to intervene next" — the report telling the reader to go fix the
 * one thing it elsewhere admits it cannot measure.
 */
test('the two unmeasurable key results never reach "Gelişime Açık"', async () => {
  const vm = await report()

  const ids = vm.openToDev.map((k) => k.id)
  expect(ids).not.toContain('k-mkt-cpl')
  expect(ids).not.toContain('k-hop-anket-genel')

  // 63 key results total; the 61 measurable ones all sit at 0% (nothing has
  // been measured yet), which is inside the band. If the two unmeasurable
  // rows were counted instead of excluded, both totals below would read 63.
  expect(vm.openToDev).toHaveLength(61)
  expect(vm.totals.openKrs).toBe(61)

  // Pazarlama has 7 key results across 4 objectives (o-pzr-1: k-mkt-lead,
  // k-mkt-cpl · o-pzr-2: 3 krs · o-pzr-3: k-mkt-cro · o-pzr-4: k-mkt-crm).
  // k-mkt-cpl is the unmeasurable one, so its row must count 6 open, not 7.
  const pazarlama = vm.rows.find((r) => r.slug === 'pazarlama')
  expect(pazarlama?.krs).toBe(7)
  expect(pazarlama?.openKrs).toBe(6)
})

test('a measurable sibling at a distinguishing percentage still surfaces, unmeasurable ones do not', async () => {
  const db = await createTestDb()
  await seed(db)

  // Every measurable key result starts at 0%, so a bare count assertion could
  // pass whether or not the exclusion actually happened — an unmeasurable row
  // at its definitional 0% looks identical to a merely-unmeasured one. Moving
  // a measurable sibling of k-mkt-cpl to a distinct, still-open percentage
  // makes the membership and ordering assertions below fail if an
  // unmeasurable row leaks back into the list.
  // k-mkt-lead: 51500 -> 57500 span, current 52700 -> (52700 - 51500) / 6000
  // * 100 = 20%.
  await db.update(keyResults).set({ current: 52700 }).where(eq(keyResults.id, 'k-mkt-lead'))

  const vm = await getReport(db, await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE]))

  const moved = vm.openToDev.find((k) => k.id === 'k-mkt-lead')
  expect(moved?.pct).toBe(20)

  const ids = vm.openToDev.map((k) => k.id)
  expect(ids).not.toContain('k-mkt-cpl')
  expect(ids).not.toContain('k-hop-anket-genel')

  // Worst-first: k-mkt-lead (20%) must sort after every key result still at
  // 0%, and the unmeasurable rows must not be present to sort against at all.
  const pcts = vm.openToDev.map((k) => k.pct)
  expect(pcts).toEqual([...pcts].sort((a, b) => a - b))
  expect(pcts[pcts.length - 1]).toBe(20)
})

/**
 * `getReport`'s `asOf` had no test at all until now — which is how the two
 * unfiltered reads (`openToDev` off `allKrs(depts)`, `totals.companyPct` off
 * `companyPct(depts)`) went unnoticed while every `ReportRow` above them
 * already excluded unmeasured key results via `measuredKrsOf`.
 */
test('a cutoff keeps the totals in lockstep with the rows, not the whole tree', async () => {
  const db = await seeded()
  const ids = await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE])
  const [m1, , m3] = (await openPeriodMonths(db)) as [string, string, string]

  // Measured by the cutoff: k-sat-italya (satis) reaches its target exactly.
  // Unmeasured by the cutoff: k-mkt-cro (pazarlama) has a row, but only after
  // it — a real row, not the summary bridge, so it is genuinely unmeasured
  // at this cutoff rather than falling through to a kept-summary exemption.
  await db.insert(krMonthlyValues).values([
    { id: 'kmv-lock-1', keyResultId: 'k-sat-italya', month: m1, value: 200, authorUserId: AUTHOR_USER_ID },
    { id: 'kmv-lock-2', keyResultId: 'k-mkt-cro', month: m3, value: 5, authorUserId: AUTHOR_USER_ID },
  ])

  const narrow = await getReport(db, ids, cutoffOf(m1))
  const wide = await getReport(db, ids)

  // The row itself reflects the cutoff: satis's own percentage moved off its
  // pre-cutoff 0% because k-sat-italya is now measured at 100% as of m1. An
  // implementation that forgot to thread `asOf` into `loadTree` would leave
  // every key result on its stored (untouched) summary and this would still
  // read 0.
  const satis = narrow.rows.find((r) => r.slug === 'satis')
  expect(satis?.pct).toBeGreaterThan(0)

  // Pazarlama's own row excludes k-mkt-cro from `openKrs` under the cutoff —
  // one fewer than without one. This is what makes the check below load-
  // bearing rather than vacuous: something a row already excludes.
  const pazarlamaOf = (vm: typeof narrow) => vm.rows.find((r) => r.slug === 'pazarlama')!
  expect(pazarlamaOf(narrow).openKrs).toBe(pazarlamaOf(wide).openKrs - 1)

  // The load-bearing check: before this fix, `openToDev`/`totals.openKrs`
  // summed the open-to-development key results across the WHOLE tree, not
  // the rows' own measured subset — so `totals.openKrs` would still count
  // k-mkt-cro even though pazarlama's row right above it just excluded it,
  // and the totals row would not equal the sum of its own column.
  const sumOfRowOpenKrs = narrow.rows.reduce((n, r) => n + r.openKrs, 0)
  expect(narrow.totals.openKrs).toBe(sumOfRowOpenKrs)
})
