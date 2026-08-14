import { eq, ne, sql } from 'drizzle-orm'
import { expect, test } from 'vitest'
import { createTestDb, type Db } from '@/lib/db'
import { keyResults, krMonthlyValues } from '@/lib/db/schema'
import { seed } from '@/lib/db/seed'
import { SEED_OBJECTIVE_PERIOD_CODE } from '@/lib/db/seed-data'
import { monthsOfPeriod } from '@/lib/domain/monthly'
import { getOverview, MONTHS_IN_YEAR } from '../overview'
import { allPeriods } from '../tables'

/** Period ids for a list of codes — the queries take ids, the seed exports codes. */
async function idsOf(db: Db, codes: string[]) {
  const rows = await allPeriods(db)
  return rows.filter((p) => codes.includes(p.code)).map((p) => p.id)
}

async function overview() {
  const db = await createTestDb()
  await seed(db)
  return getOverview(db, await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE]))
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

/** A deterministic `now` that lands inside `month`, so `getOverview`'s
 *  "nothing after today" cutoff never excludes the fixture months on
 *  purpose. */
const middleOf = (month: string): Date => new Date(`${month}-15T10:00:00Z`)

const AUTHOR_USER_ID = 'u-kagan.ozturk'

/** A cutoff landing inside `month`, day immaterial (`loadTree` truncates it). */
const cutoffOf = (month: string): string => `${month}-15`

test('the headline numbers reflect a freshly imported workbook, nothing measured yet', async () => {
  const vm = await overview()
  expect(vm.companyPct).toBe(0)
  // 63 key results total, but 2 are unmeasurable (start === target) and are
  // excluded from "open to development" — see the unmeasurable-exclusion
  // tests below for why.
  // With no cutoff every key result is measured, so `measuredKrs` equals `krs`.
  expect(vm.kpis).toEqual({ depts: 10, objectives: 26, krs: 63, measuredKrs: 63, avgPct: 0, openKrs: 61 })
})

test('every department carries its own rollup and counts', async () => {
  const vm = await overview()
  expect(vm.depts).toHaveLength(10)

  const bySlug = Object.fromEntries(vm.depts.map((d) => [d.slug, d.pct]))
  expect(bySlug).toEqual({
    sirket: 0, pazarlama: 0, misafir: 0, 'satis-kalite': 0, finans: 0,
    'insan-kultur': 0, satis: 0, medikal: 0, 'hasta-op': 0, 'pre-op': 0,
  })

  expect(vm.depts.reduce((s, d) => s + d.objectiveCount, 0)).toBe(26)
  expect(vm.depts.reduce((s, d) => s + d.krCount, 0)).toBe(63)

  // Leads are deliberately unassigned (no per-person ownership in the source
  // workbook) — resolution must land on '', not a stale id or a crash.
  const satis = vm.depts.find((d) => d.slug === 'satis')
  expect(satis?.leadName).toBe('')
  expect(satis?.nameTr).toBeTruthy()
  expect(satis?.nameEn).toBeTruthy()
})

test('the attention list holds the open-to-development key results, worst first', async () => {
  const db = await createTestDb()
  await seed(db)

  // With every real key result at a uniform 0%, "worst first" and "≤59%" are
  // both trivially true of any ordering — even a broken one. Moving three key
  // results to distinct, non-zero percentages (still ≤59, so they stay in the
  // open-to-development band) gives the ordering assertion something it can
  // actually fail against.
  await db.update(keyResults).set({ current: 0.75 }).where(eq(keyResults.id, 'k-mkt-cro')) // 0 -> 7.5: 10%
  await db.update(keyResults).set({ current: 21 }).where(eq(keyResults.id, 'k-hop-satisorani')) // 0 -> 70: 30%
  await db.update(keyResults).set({ current: 1.5 }).where(eq(keyResults.id, 'k-fin-kayip')) // 2 -> 1: 50%

  const vm = await getOverview(db, await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE]))
  expect(vm.attention).toHaveLength(vm.kpis.openKrs)

  for (const item of vm.attention) {
    expect(item.pct).toBeLessThanOrEqual(59)
    expect(item.deptSlug).toBeTruthy()
    expect(item.deptEmoji).toBeTruthy()
    // Ownership has not been assigned yet — every item must resolve to an
    // explicit '', not a dangling id or undefined.
    expect(item.ownerName).toBe('')
    expect(['high', 'mid', 'low']).toContain(item.confidence)
    expect(Number.isFinite(item.daysSinceUpdate)).toBe(true)
  }

  const pcts = vm.attention.map((a) => a.pct)
  expect(pcts).toEqual([...pcts].sort((a, b) => a - b))
  // The rest sit at 0%, so the three moved key results must surface last, in
  // ascending order — a reversed or unsorted list would fail this.
  expect(pcts.slice(-3)).toEqual([10, 30, 50])
})

test('the distribution covers the 61 measurable key results, not all 63', async () => {
  const vm = await overview()
  expect(vm.distribution.map((d) => d.status)).toEqual(['above', 'expected', 'below', 'open', 'none'])
  // 63 key results total; the 2 unmeasurable ones (k-mkt-cpl, k-hop-anket-genel)
  // are excluded from every bucket, so the buckets sum to 61, not 63.
  expect(vm.distribution.reduce((s, d) => s + d.count, 0)).toBe(61)

  // Nothing measurable has moved off its starting value, so every measurable
  // key result reads exactly 0% and lands in "none" ("Başlamadı").
  expect(vm.distribution).toEqual([
    { status: 'above', count: 0 },
    { status: 'expected', count: 0 },
    { status: 'below', count: 0 },
    { status: 'open', count: 0 },
    { status: 'none', count: 61 },
  ])

  const open = vm.distribution.find((d) => d.status === 'open')?.count ?? 0
  const none = vm.distribution.find((d) => d.status === 'none')?.count ?? 0
  // "Gelişime Açık" in the KPI row is everything at or under 59%, which is
  // exactly the "open" and "not started" buckets put together.
  expect(open + none).toBe(vm.kpis.openKrs)
})

test('unmeasurable key results are excluded from the attention list, its count, and the distribution', async () => {
  const db = await createTestDb()
  await seed(db)

  // Every measurable key result starts at 0%, which already qualifies for
  // "Gelişime Açık" (≤59%) — so membership alone would not yet distinguish
  // "the exclusion is applied" from "it isn't": an unmeasurable key result
  // sitting at its definitional 0% would slot in exactly the same way. Moving
  // a measurable *sibling* of each unmeasurable row to a distinct percentage
  // makes the exclusion observable rather than coincidental.
  // k-mkt-lead (pazarlama, sibling of k-mkt-cpl): 51500 -> 57500 span,
  // current 52700 -> (52700 - 51500) / 6000 * 100 = 20%.
  await db.update(keyResults).set({ current: 52700 }).where(eq(keyResults.id, 'k-mkt-lead'))
  // k-hop-tercuman (hasta-op, sibling of k-hop-anket-genel): 0 -> 4.8 span,
  // current 2.4 -> 2.4 / 4.8 * 100 = 50%.
  await db.update(keyResults).set({ current: 2.4 }).where(eq(keyResults.id, 'k-hop-tercuman'))

  const vm = await getOverview(db, await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE]))

  const attentionIds = vm.attention.map((a) => a.krId)
  expect(attentionIds).not.toContain('k-mkt-cpl')
  expect(attentionIds).not.toContain('k-hop-anket-genel')
  expect(attentionIds).toContain('k-mkt-lead')
  expect(attentionIds).toContain('k-hop-tercuman')

  // 63 key results total, 2 unmeasurable; the remaining 61 (including the two
  // just moved, both still ≤59%) all stay in "Gelişime Açık".
  expect(vm.attention).toHaveLength(61)
  expect(vm.kpis.openKrs).toBe(61)

  // Distribution: 61 measurable key results. 59 are untouched at 0% ("none" /
  // Başlamadı); the two just moved (20% and 50%) land in "open" (Gelişime
  // Açık, 1–59%). The 2 unmeasurable rows appear in neither bucket — if they
  // did, the total below would read 63 and "none" would read 61.
  const bucket = (status: string) => vm.distribution.find((d) => d.status === status)?.count ?? 0
  expect(vm.distribution.reduce((s, d) => s + d.count, 0)).toBe(61)
  expect(bucket('open')).toBe(2)
  expect(bucket('none')).toBe(59)
})

test('the trend is empty when no monthly value has ever been recorded — never a fabricated point', async () => {
  const db = await createTestDb()
  await seed(db)
  const ids = await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE])

  const vm = await getOverview(db, ids, new Date('2026-03-15T10:00:00Z'))

  expect(vm.trend).toEqual([])
})

test('an unmatched range yields an empty trend, never a fabricated ramp', async () => {
  const db = await createTestDb()
  await seed(db)
  const vm = await getOverview(db, [], new Date('2026-03-15T10:00:00Z'))

  expect(vm.trend).toEqual([])
})

test('three months of monthly data produce three chronological trend points', async () => {
  const db = await createTestDb()
  await seed(db)
  const ids = await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE])
  const months = await openPeriodMonths(db)
  const [m1, m2, m3] = months
  if (!m1 || !m2 || !m3) throw new Error('open period needs at least three months')

  await db.insert(krMonthlyValues).values([
    { id: 'kmv-trend-1', keyResultId: 'k-mkt-cro', month: m1, value: 1, authorUserId: AUTHOR_USER_ID },
    { id: 'kmv-trend-2', keyResultId: 'k-mkt-cro', month: m2, value: 2, authorUserId: AUTHOR_USER_ID },
    { id: 'kmv-trend-3', keyResultId: 'k-mkt-cro', month: m3, value: 3, authorUserId: AUTHOR_USER_ID },
  ])

  const vm = await getOverview(db, ids, middleOf(m3))

  expect(vm.trend).toHaveLength(3)
  expect(vm.trend.map((p) => p.month)).toEqual([m1, m2, m3].map((m) => m.slice(5, 7)))
  // Each point's pace still follows the straight Jan-Dec target line, keyed
  // off that point's own calendar month, not its position in the array.
  expect(vm.trend.map((p) => p.pace)).toEqual(
    [m1, m2, m3].map((m) => Math.round(((Number(m.slice(5, 7)) - 1) * 100) / (MONTHS_IN_YEAR - 1))),
  )
})

test('a point is the cumulative sum-to-date, not that single month\'s figure — proven on a sum-rule key result', async () => {
  const db = await createTestDb()
  await seed(db)
  const ids = await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE])
  const months = await openPeriodMonths(db)
  const [m1, m2, m3] = months
  if (!m1 || !m2 || !m3) throw new Error('open period needs at least three months')

  // `k-sat-italya` (dept "satis", objective "o-sat-1") is a `sum`-rule key
  // result: start 0, target 200 (lib/db/seed-data.ts). A `sum` KR is where
  // "cumulative" and "this month alone" diverge hardest — an `avg`-rule KR
  // (like `k-mkt-cro`, used by the other trend tests) can coincide with its
  // own running average and would not catch a regression back to per-month
  // values.
  //
  // Every OTHER key result in the company is made unmeasurable
  // (target := start) so `companyPct` has exactly one measurable key result
  // anywhere: `k-sat-italya`'s own objective, department and the company
  // figure all collapse onto its `krPct` with no other contributor and no
  // rounding from averaging across siblings — the company percentage at
  // each point is *exactly* `k-sat-italya`'s own percentage, so it can be
  // hand-computed and asserted precisely.
  await db.update(keyResults).set({ target: sql`${keyResults.start}` }).where(ne(keyResults.id, 'k-sat-italya'))

  // Monthly entries: 20, 40, 60. Against target 200 (start 0), krPct is
  // round(current / 200 * 100).
  //
  //   month | cumulative sum | cumulative pct (correct) | per-month value | per-month pct (bug)
  //   m1    | 20             | round(20/200*100)  = 10  | 20              | 10
  //   m2    | 60             | round(60/200*100)  = 30  | 40              | 20
  //   m3    | 120            | round(120/200*100) = 60  | 60              | 30
  //
  // The two columns agree at m1 (a single filled month is its own sum) and
  // diverge at every point after — exactly the case that catches
  // `cumulativeMonths` being reverted to `[month]`.
  await db.insert(krMonthlyValues).values([
    { id: 'kmv-cum-1', keyResultId: 'k-sat-italya', month: m1, value: 20, authorUserId: AUTHOR_USER_ID },
    { id: 'kmv-cum-2', keyResultId: 'k-sat-italya', month: m2, value: 40, authorUserId: AUTHOR_USER_ID },
    { id: 'kmv-cum-3', keyResultId: 'k-sat-italya', month: m3, value: 60, authorUserId: AUTHOR_USER_ID },
  ])

  const vm = await getOverview(db, ids, middleOf(m3))

  expect(vm.trend.map((p) => p.month)).toEqual([m1, m2, m3].map((m) => m.slice(5, 7)))
  expect(vm.trend.map((p) => p.actual)).toEqual([10, 30, 60])
})

test('a gap between two data months produces two points, none for the skipped month in between', async () => {
  const db = await createTestDb()
  await seed(db)
  const ids = await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE])
  const months = await openPeriodMonths(db)
  const [m1, m2, m3] = months
  if (!m1 || !m2 || !m3) throw new Error('open period needs at least three months')

  // m2 is deliberately left unrecorded — a real gap, not a stand-in zero.
  await db.insert(krMonthlyValues).values([
    { id: 'kmv-gap-1', keyResultId: 'k-mkt-cro', month: m1, value: 1, authorUserId: AUTHOR_USER_ID },
    { id: 'kmv-gap-2', keyResultId: 'k-mkt-cro', month: m3, value: 3, authorUserId: AUTHOR_USER_ID },
  ])

  const vm = await getOverview(db, ids, middleOf(m3))

  expect(vm.trend).toHaveLength(2)
  expect(vm.trend.map((p) => p.month)).toEqual([m1, m3].map((m) => m.slice(5, 7)))
  expect(vm.trend.map((p) => p.month)).not.toContain(m2.slice(5, 7))
})

test('the trend arrives chronologically sorted even when the underlying rows are written out of order', async () => {
  const db = await createTestDb()
  await seed(db)
  const ids = await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE])
  const months = await openPeriodMonths(db)
  const [m1, m2, m3] = months
  if (!m1 || !m2 || !m3) throw new Error('open period needs at least three months')

  // Inserted latest-first on purpose: `TrendChart` positions points by
  // `point.month`, but it still assumes the array it receives is already in
  // chronological order (see its docs). This proves `buildTrend` — the
  // producer — guarantees that order itself, rather than trusting whatever
  // order the rows happen to come back from the database in.
  await db.insert(krMonthlyValues).values([
    { id: 'kmv-order-3', keyResultId: 'k-mkt-cro', month: m3, value: 3, authorUserId: AUTHOR_USER_ID },
    { id: 'kmv-order-1', keyResultId: 'k-mkt-cro', month: m1, value: 1, authorUserId: AUTHOR_USER_ID },
    { id: 'kmv-order-2', keyResultId: 'k-mkt-cro', month: m2, value: 2, authorUserId: AUTHOR_USER_ID },
  ])

  const vm = await getOverview(db, ids, middleOf(m3))

  expect(vm.trend.map((p) => p.month)).toEqual([m1, m2, m3].map((m) => m.slice(5, 7)))
})

test('a key result with no measurement in the window does not drag the trend toward zero', async () => {
  const db = await createTestDb()
  await seed(db)
  const ids = await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE])
  const months = await openPeriodMonths(db)
  const [m1, m2] = months
  if (!m1 || !m2) throw new Error('open period needs at least two months')

  // Isolate the company figure to exactly two key results in two different
  // departments, the same technique the cumulative-sum test above uses:
  // every other key result becomes unmeasurable (target := start), so
  // `companyPct` has nothing else to average in.
  await db
    .update(keyResults)
    .set({ target: sql`${keyResults.start}` })
    .where(sql`${keyResults.id} not in ('k-sat-italya', 'k-mkt-cro')`)

  // k-sat-italya (satis, `sum`, start 0, target 200): measured this month —
  // current 20, krPct = round(20/200*100) = 10%.
  //
  // k-mkt-cro (pazarlama, `avg`, start 0, target 7.5): has a monthly row, but
  // only after this point's cutoff — none up to it. This is deliberately NOT
  // "no monthly row at all": a key result with zero rows ever is the bridge
  // (`loadTree` keeps its stored summary and counts it as measured, by
  // design — see the design doc's "hiç aylık satırı yok" row), so it would
  // not exercise the exclusion this test is pinning. A row that exists but
  // sits after the cutoff is the case that actually leaves it unmeasured.
  await db.insert(krMonthlyValues).values([
    { id: 'kmv-unmeasured-1', keyResultId: 'k-sat-italya', month: m1, value: 20, authorUserId: AUTHOR_USER_ID },
    { id: 'kmv-unmeasured-2', keyResultId: 'k-mkt-cro', month: m2, value: 5, authorUserId: AUTHOR_USER_ID },
  ])

  const vm = await getOverview(db, ids, middleOf(m1))

  expect(vm.trend).toHaveLength(1)
  // Before the fix: `k-mkt-cro` falls back to `start` (0%) and is still
  // averaged in alongside satis's 10%, giving (10 + 0) / 2 = 5. The correct
  // reading excludes it — an unmeasured key result is not a measured 0% —
  // leaving satis's own 10% as the whole company figure.
  expect(vm.trend[0]?.actual).toBe(10)
})

test('the view model is JSON-serialisable so it can cross to the client', async () => {
  const vm = await overview()
  expect(JSON.parse(JSON.stringify(vm))).toEqual(vm)
})

test('an unknown period yields an empty overview rather than throwing', async () => {
  const db = await createTestDb()
  await seed(db)
  const vm = await getOverview(db, [])

  expect(vm.companyPct).toBe(0)
  expect(vm.kpis).toEqual({ depts: 0, objectives: 0, krs: 0, measuredKrs: 0, avgPct: 0, openKrs: 0 })
  expect(vm.attention).toEqual([])
  expect(vm.distribution.every((d) => d.count === 0)).toBe(true)
})

test('with no monthly values on file, a cutoff changes no screen number', async () => {
  const db = await seeded()
  const ids = await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE])
  const months = await openPeriodMonths(db)
  const now = middleOf(months[11]!)

  // Every seeded key result has `current === start`, which would make this
  // assertion vacuous: an implementation with no bridge at all falls through to
  // `start` and still matches. So give one key result a summary that is
  // distinguishable from its start first — now "kept the summary" and "fell to
  // start" are different numbers and only the bridge passes.
  //
  // 100, not some value above 118 (59% of 200): the attention list only holds
  // key results at or under 59%, so a summary above that band would drop out
  // of `attention` entirely under a *correct* implementation and this test
  // could never observe it there regardless of the bridge's correctness.
  await db.update(keyResults).set({ current: 100 }).where(eq(keyResults.id, 'k-sat-italya'))

  // The bridge's guarantee, and the deploy risk's test: `kr_monthly_values` is
  // empty in the seed and in production, so a cutoff must be a no-op.
  const withCutoff = await getOverview(db, ids, now, cutoffOf(months[6]!))
  const without = await getOverview(db, ids, now)

  expect(withCutoff).toEqual(without)
  // And prove the fixture actually distinguishes the two: 100 of the way from 0
  // to 200 is 50%, which a `start` fallback would report as 0%.
  const kr = withCutoff.attention.find((a) => a.krId === 'k-sat-italya')
  expect(kr?.current ?? null).toBe(100)
})

test('the headline equals the trend’s last point', async () => {
  const db = await seeded()
  const ids = await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE])
  const [m1, m2] = (await openPeriodMonths(db)) as [string, string]

  await db.insert(krMonthlyValues).values([
    { id: 'kmv-head-1', keyResultId: 'k-sat-italya', month: m1, value: 20, authorUserId: AUTHOR_USER_ID },
    { id: 'kmv-head-2', keyResultId: 'k-sat-italya', month: m2, value: 40, authorUserId: AUTHOR_USER_ID },
  ])

  const months = await openPeriodMonths(db)
  const vm = await getOverview(db, ids, middleOf(months[11]!), cutoffOf(months[11]!))

  // Months after the last one with data contribute nothing, so "as of the
  // period's end" and "as of the last data month" are the same computation.
  // This is a consistency check, not a pin on the exclusion itself — every
  // key result in this fixture is measured, so `measuredOnly` is the identity
  // function here. It still catches a real regression: if `companyPct` and
  // the trend's last point ever stopped sharing the same chain (even one
  // that happened to agree on this fixture), this would drift and fail.
  expect(vm.trend.length).toBeGreaterThan(0)
  expect(vm.trend[vm.trend.length - 1]!.actual).toBe(vm.companyPct)
})

test('the headline still equals the trend’s last point when the cutoff falls mid-period', async () => {
  const db = await seeded()
  const ids = await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE])
  const [m1, m2, m3] = (await openPeriodMonths(db)) as [string, string, string]

  await db.insert(krMonthlyValues).values([
    { id: 'kmv-mid-1', keyResultId: 'k-sat-italya', month: m1, value: 20, authorUserId: AUTHOR_USER_ID },
    { id: 'kmv-mid-2', keyResultId: 'k-sat-italya', month: m2, value: 40, authorUserId: AUTHOR_USER_ID },
    // On file, well before `now`, but AFTER the cutoff below — the case a
    // mid-period `to` on the `custom` preset produces: the range's end sits
    // in the past, but not as far in the past as "today".
    { id: 'kmv-mid-3', keyResultId: 'k-sat-italya', month: m3, value: 60, authorUserId: AUTHOR_USER_ID },
  ])

  const months = await openPeriodMonths(db)
  const now = middleOf(months[11]!)
  const vm = await getOverview(db, ids, now, cutoffOf(m2))

  // Before this fix, `buildTrend` bounded its months only by `now` (month
  // 11), not by the cutoff (m2) — so it would still plot m3's point even
  // though every other number on the screen is reporting the company as of
  // m2. The previous "headline equals trend's last point" test cannot catch
  // this: its cutoff sits at the last data month, the one case where "bounded
  // by now" and "bounded by the cutoff" already agree.
  expect(vm.trend.map((p) => p.month)).not.toContain(m3.slice(5, 7))
  expect(vm.trend[vm.trend.length - 1]!.actual).toBe(vm.companyPct)
})

test('a key result unmeasured by the cutoff is excluded, not counted as zero', async () => {
  const db = await seeded()
  const ids = await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE])
  const [m1, , m3] = (await openPeriodMonths(db)) as [string, string, string]
  const months = await openPeriodMonths(db)
  const now = middleOf(months[11]!)

  // Data only after the cutoff: this key result has rows but nothing to report.
  await db.insert(krMonthlyValues).values({
    id: 'kmv-excl-1', keyResultId: 'k-sat-italya', month: m3, value: 60, authorUserId: AUTHOR_USER_ID,
  })

  const narrow = await getOverview(db, ids, now, cutoffOf(m1))
  const wide = await getOverview(db, ids, now)

  expect(narrow.kpis.measuredKrs).toBe(wide.kpis.krs - 1)
  expect(narrow.kpis.krs).toBe(wide.kpis.krs) // the total is still the total
  expect(narrow.attention.map((a) => a.krId)).not.toContain('k-sat-italya')
})
