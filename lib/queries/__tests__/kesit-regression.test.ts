import { expect, test } from 'vitest'
import { createTestDb, type Db } from '@/lib/db'
import { krMonthlyValues } from '@/lib/db/schema'
import { seed } from '@/lib/db/seed'
import { SEED_OBJECTIVE_PERIOD_CODE } from '@/lib/db/seed-data'
import { asOfCutoff, todayInIstanbul } from '@/lib/domain/dates'
import { monthsOfPeriod } from '@/lib/domain/monthly'
import { getDepartment } from '../department'
import { getOverview } from '../overview'
import { resolveRange } from '../range'
import { getReport } from '../report'
import { getSidebarData } from '../sidebar'
import { allPeriods } from '../tables'
import { allKrs, loadTree, type DeptNode } from '../tree'

/**
 * End-to-end regression for the cutoff reinterpretation of the date-range
 * filter (Tasks 1-6): every screen shows the state "as of" the range's end,
 * cumulative from each key result's own period start. These tests exercise
 * the whole chain — URL params -> resolved cutoff -> tree rollup -> every
 * screen's view model — rather than any single layer in isolation.
 */

async function seeded() {
  const db = await createTestDb()
  await seed(db)
  return db
}

/** Period ids for a list of codes — the queries take ids, the seed exports codes. */
async function idsOf(db: Db, codes: string[]) {
  const rows = await allPeriods(db)
  return rows.filter((p) => codes.includes(p.code)).map((p) => p.id)
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

/** A deterministic `now` that lands inside `month`, so a screen's "nothing
 *  after today" cutoff never excludes the fixture months by accident. */
const middleOf = (month: string): Date => new Date(`${month}-15T10:00:00Z`)

const krById = (depts: DeptNode[], id: string) => {
  const found = allKrs(depts).find(({ kr }) => kr.id === id)
  if (!found) throw new Error(`key result ${id} not in tree`)
  return found.kr
}

/** Which department a key result lives in — derived, so a seed reshuffle cannot
 *  silently point this test at the wrong department. */
async function deptSlugOfKr(db: Db, ids: string[], krId: string): Promise<string> {
  const { depts } = await loadTree(db, ids)
  const found = depts.find((d) => d.objectives.some((o) => o.krs.some((k) => k.id === krId)))
  if (!found) throw new Error(`key result ${krId} is in no department`)
  return found.slug
}

test('a cutoff reports the cumulative figure up to it, per each rule', async () => {
  const db = await seeded()
  const ids = await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE])
  const [m1, m2, m3] = (await openPeriodMonths(db)) as [string, string, string]

  // One key result per rule: sum, avg, last.
  await db.insert(krMonthlyValues).values([
    { id: 'kr-s-1', keyResultId: 'k-sat-italya', month: m1, value: 20, authorUserId: AUTHOR_USER_ID },
    { id: 'kr-s-2', keyResultId: 'k-sat-italya', month: m2, value: 20, authorUserId: AUTHOR_USER_ID },
    { id: 'kr-s-3', keyResultId: 'k-sat-italya', month: m3, value: 500, authorUserId: AUTHOR_USER_ID },
    // Inside its own 98.87 → 99.5 band, so the figure reads as a real quality
    // score rather than a regression that would puzzle a later reader.
    { id: 'kr-a-1', keyResultId: 'k-skl-skor', month: m1, value: 99, authorUserId: AUTHOR_USER_ID },
    { id: 'kr-a-2', keyResultId: 'k-skl-skor', month: m2, value: 99.4, authorUserId: AUTHOR_USER_ID },
    { id: 'kr-a-3', keyResultId: 'k-skl-skor', month: m3, value: 10, authorUserId: AUTHOR_USER_ID },
    { id: 'kr-l-1', keyResultId: 'k-mkt-seo', month: m1, value: 30, authorUserId: AUTHOR_USER_ID },
    { id: 'kr-l-2', keyResultId: 'k-mkt-seo', month: m2, value: 45, authorUserId: AUTHOR_USER_ID },
    { id: 'kr-l-3', keyResultId: 'k-mkt-seo', month: m3, value: 99, authorUserId: AUTHOR_USER_ID },
  ])

  const { depts } = await loadTree(db, ids, cutoffOf(m2))

  // The third month is after the cutoff and deliberately far off, so a leak
  // could not be mistaken for the right answer under any rule.
  expect(krById(depts, 'k-sat-italya').current).toBe(40)          // 20 + 20
  expect(krById(depts, 'k-skl-skor').current).toBeCloseTo(99.2, 5) // mean of 99, 99.4
  expect(krById(depts, 'k-mkt-seo').current).toBe(45)             // the later month's figure
  for (const id of ['k-sat-italya', 'k-skl-skor', 'k-mkt-seo']) {
    expect(krById(depts, id).latestMonth).toBe(m2)
  }
})

test('every screen agrees on one department’s number for one URL', async () => {
  const db = await seeded()
  const ids = await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE])
  const [m1, , m3] = (await openPeriodMonths(db)) as [string, string, string]
  const months = await openPeriodMonths(db)

  await db.insert(krMonthlyValues).values({
    id: 'kr-agree-1', keyResultId: 'k-sat-italya', month: m1, value: 20, authorUserId: AUTHOR_USER_ID,
  })

  const cutoff = cutoffOf(m3)
  const slug = await deptSlugOfKr(db, ids, 'k-sat-italya')

  const overview = await getOverview(db, ids, middleOf(months[11]!), cutoff)
  const dept = await getDepartment(db, slug, ids, cutoff)
  const report = await getReport(db, ids, cutoff)
  const sidebar = await getSidebarData(db, ids, cutoff)

  expect(overview.depts.find((d) => d.slug === slug)!.pct).toBe(dept!.pct)
  expect(report.rows.find((r) => r.slug === slug)!.pct).toBe(dept!.pct)
  expect(sidebar.pctBySlug[slug]).toBe(dept!.pct)
})

test('a range ending in the future is read as of today, so the headline still equals the trend', async () => {
  const db = await seeded()
  const ids = await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE])
  const months = await openPeriodMonths(db)
  const m1 = months[0]!
  const futureMonth = months[5]!

  const period = (await allPeriods(db)).find((p) => p.code === SEED_OBJECTIVE_PERIOD_CODE)
  if (!period) throw new Error('seed has no open period')
  // Exactly what the "Bu dönem" preset produces: the range ends on the open
  // period's last day, which is months after today for most of a fiscal year.
  const rangeEnd = period.endsOn
  const now = middleOf(m1)

  // One real measurement in the month today sits in.
  await db.insert(krMonthlyValues).values({
    id: 'kr-clamp-now', keyResultId: 'k-sat-italya', month: m1, value: 20, authorUserId: AUTHOR_USER_ID,
  })
  // ...and a value against a month that has not happened yet, for every key
  // result. This is reachable, not contrived: `lib/queries/monthly.ts` lists
  // every month of the open period in the entry picker with no upper bound.
  const { depts } = await loadTree(db, ids)
  await db.insert(krMonthlyValues).values(
    allKrs(depts).map(({ kr }, i) => ({
      id: `kr-clamp-future-${i}`,
      keyResultId: kr.id,
      month: futureMonth,
      value: kr.target,
      authorUserId: AUTHOR_USER_ID,
    })),
  )

  const asOf = asOfCutoff(rangeEnd, now)
  // Guard the guard: if the seeded period had already ended, the clamp would be
  // a no-op and everything below would go vacuous.
  expect(rangeEnd > todayInIstanbul(now), 'the range end must really be in the future').toBe(true)
  expect(asOf).toBe(todayInIstanbul(now))

  const vm = await getOverview(db, ids, now, asOf)
  const last = vm.trend[vm.trend.length - 1]
  expect(last, 'the trend must have a point to compare against').toBeTruthy()
  expect(vm.companyPct).toBe(last!.actual)

  // The bite: the same call with the raw range end. `buildTrend` bounds itself
  // by today either way, so the trend's last point does not move — but the
  // headline rolls the future month in and the equality the whole cutoff design
  // rests on breaks. This is the state the pages were in before the clamp.
  const unclamped = await getOverview(db, ids, now, rangeEnd)
  const unclampedLast = unclamped.trend[unclamped.trend.length - 1]
  expect(unclampedLast!.actual).toBe(last!.actual)
  expect(unclamped.companyPct).not.toBe(unclampedLast!.actual)
})

test('a URL’s range resolves into the cutoff the screens actually read', async () => {
  const db = await seeded()
  const [m1, m2, m3] = (await openPeriodMonths(db)) as [string, string, string]

  await db.insert(krMonthlyValues).values([
    { id: 'kr-url-1', keyResultId: 'k-sat-italya', month: m1, value: 20, authorUserId: AUTHOR_USER_ID },
    { id: 'kr-url-2', keyResultId: 'k-sat-italya', month: m2, value: 20, authorUserId: AUTHOR_USER_ID },
    { id: 'kr-url-3', keyResultId: 'k-sat-italya', month: m3, value: 500, authorUserId: AUTHOR_USER_ID },
  ])

  // Exactly what a page does: untrusted search params in, cutoff out, tree read.
  const selection = await resolveRange(db, { from: `${m1}-01`, to: `${m2}-28` })
  const ids = selection.periods.map((p) => p.id)
  const { depts } = await loadTree(db, ids, selection.range.to)

  expect(krById(depts, 'k-sat-italya').current).toBe(40)
  expect(krById(depts, 'k-sat-italya').latestMonth).toBe(m2)
})
