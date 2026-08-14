import { eq } from 'drizzle-orm'
import { expect, test } from 'vitest'
import { createTestDb, type Db } from '@/lib/db'
import { keyResults, krMonthlyValues, objectives } from '@/lib/db/schema'
import { seed } from '@/lib/db/seed'
import { SEED_CLOSED_PERIOD_CODE, SEED_OBJECTIVE_PERIOD_CODE } from '@/lib/db/seed-data'
import { monthsOfPeriod } from '@/lib/domain/monthly'
import { companyPct, deptPct, krPct } from '@/lib/domain/progress'
import { isOpenToDevelopment } from '@/lib/domain/status'
import { allPeriods } from '../tables'
import { allKrs, loadTree, measuredOnly, type DeptNode } from '../tree'

async function seeded() {
  const db = await createTestDb()
  await seed(db)
  return db
}

/** Period ids for a list of codes — `loadTree` takes ids, the seed exports codes. */
async function idsOf(db: Awaited<ReturnType<typeof seeded>>, codes: string[]) {
  const rows = await allPeriods(db)
  return rows.filter((p) => codes.includes(p.code)).map((p) => p.id)
}

/** The open seed period's own months, chronological. Hard-coded calendar dates
 *  would drift out of the seed's fiscal year over time. */
async function openPeriodMonths(db: Db): Promise<string[]> {
  const rows = await allPeriods(db)
  const period = rows.find((p) => p.code === SEED_OBJECTIVE_PERIOD_CODE)
  if (!period) throw new Error('seed has no open period')
  return monthsOfPeriod(period.startsOn, period.endsOn)
}

/** A cutoff inside a month — mid-month on purpose, so every test also exercises
 *  the truncation `loadTree` applies. */
const cutoffOf = (month: string) => `${month}-15`

const AUTHOR_USER_ID = 'u-kagan.ozturk'

const krById = (depts: DeptNode[], id: string) => {
  const found = allKrs(depts).find(({ kr }) => kr.id === id)
  if (!found) throw new Error(`key result ${id} not in tree`)
  return found.kr
}

test('the tree loads the full seeded dataset for one period', async () => {
  const db = await seeded()
  const ids = await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE])
  const { periods, depts } = await loadTree(db, ids)

  expect(periods.map((p) => p.code)).toEqual([SEED_OBJECTIVE_PERIOD_CODE])
  expect(depts).toHaveLength(10)
  expect(depts.flatMap((d) => d.objectives)).toHaveLength(26)
  expect(allKrs(depts)).toHaveLength(63)
})

test('progress computed from the database opens at zero company-wide', async () => {
  const db = await seeded()
  const { depts } = await loadTree(db, await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE]))
  expect(companyPct(depts)).toBe(0)

  const bySlug = Object.fromEntries(depts.map((d) => [d.slug, deptPct(d.objectives)]))
  expect(bySlug).toEqual({
    sirket: 0, pazarlama: 0, misafir: 0, 'satis-kalite': 0, finans: 0,
    'insan-kultur': 0, satis: 0, medikal: 0, 'hasta-op': 0, 'pre-op': 0,
  })
})

test('every key result sits in the "Gelişime Açık" band (≤%59) — none has moved off its start', async () => {
  // The seventeen-out-of-25 claim had no equivalent once every KR opens at
  // current === start: with nothing measured yet, all 63 read 0% and all 63
  // fall in the lowest band. The claim that still bites is that this is
  // total, not partial, and that the underlying percentage really is zero.
  const db = await seeded()
  const { depts } = await loadTree(db, await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE]))
  const all = allKrs(depts)
  const openToDev = all.filter(({ kr }) => isOpenToDevelopment(krPct(kr)))
  expect(all).toHaveLength(63)
  expect(openToDev).toHaveLength(63)
  expect(all.every(({ kr }) => krPct(kr) === 0)).toBe(true)
})

test('owners resolve to an explicit empty name, not left dangling', async () => {
  // The source workbook has no per-person ownership, only role labels — every
  // lead/owner is seeded as '' and must resolve that way, not as a stale id,
  // a crash, or an accidental match on some other user.
  const db = await seeded()
  const { depts } = await loadTree(db, await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE]))
  const satis = depts.find((d) => d.slug === 'satis')
  expect(satis?.leadName).toBe('')
  expect(satis?.objectives[0]?.ownerName).toBe('')
  expect(satis?.objectives[0]?.krs[0]?.ownerName).toBe('')
})

test('several periods load as one merged tree', async () => {
  const db = await seeded()

  // The seed puts EVERY objective in the open quarter (lib/db/seed.ts assigns
  // SEED_OBJECTIVE_PERIOD_ID to all of them), so the closed quarter is empty and
  // comparing 0 + N against N would pass even if loadTree dropped a period. This
  // test therefore plants its own objective in the closed quarter first.
  const closed = (await allPeriods(db)).find((p) => p.code === SEED_CLOSED_PERIOD_CODE)
  if (!closed) throw new Error('seed has no closed period')

  await db.insert(objectives).values({
    id: 'o-merge-test',
    code: 'OT1',
    departmentId: 'satis',
    periodId: closed.id,
    titleTr: 'Birleşim testi hedefi',
    titleEn: 'Merge test objective',
    ownerUserId: null,
  })
  await db.insert(keyResults).values([
    { id: 'k-merge-a', objectiveId: 'o-merge-test', titleTr: 'A', titleEn: 'A',
      start: 0, current: 0, target: 100, unit: '', confidence: 'mid', ownerUserId: null },
    { id: 'k-merge-b', objectiveId: 'o-merge-test', titleTr: 'B', titleEn: 'B',
      start: 0, current: 100, target: 100, unit: '', confidence: 'mid', ownerUserId: null },
  ])

  const openIds = await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE])
  const closedIds = await idsOf(db, [SEED_CLOSED_PERIOD_CODE])

  const open = (await loadTree(db, openIds)).depts.flatMap((d) => d.objectives).length
  const closedCount = (await loadTree(db, closedIds)).depts.flatMap((d) => d.objectives).length
  const { periods, depts } = await loadTree(db, [...openIds, ...closedIds])
  const merged = depts.flatMap((d) => d.objectives).length

  // Guard the guard: if either side is empty the sum assertion goes vacuous.
  expect(open, 'open quarter must carry objectives').toBeGreaterThan(0)
  expect(closedCount, 'closed quarter must carry objectives').toBeGreaterThan(0)

  expect(periods).toHaveLength(2)
  // Objectives belong to exactly one period, so the union is a plain sum —
  // nothing is double counted and nothing is dropped.
  expect(merged).toBe(open + closedCount)

  // The planted objective really is reachable through the merged tree.
  const satis = depts.find((d) => d.slug === 'satis')
  expect(satis?.objectives.some((o) => o.id === 'o-merge-test')).toBe(true)
})

test('an empty id list yields no departments rather than throwing', async () => {
  const { periods, depts } = await loadTree(await seeded(), [])
  expect(periods).toEqual([])
  expect(depts).toEqual([])
})

test('an unknown period id yields no objectives', async () => {
  const { periods, depts } = await loadTree(await seeded(), ['p-yok'])
  expect(periods).toEqual([])
  expect(depts.flatMap((d) => d.objectives)).toEqual([])
})

test('omitting the cutoff leaves the stored summary untouched', async () => {
  // The whole point of `asOf` being optional: a caller that never passes it
  // must see exactly today's behaviour.
  const db = await seeded()
  const { depts } = await loadTree(db, await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE]))
  const kr = allKrs(depts).find(({ kr }) => kr.id === 'k-sirket-marka')
  expect(kr?.kr.current).toBe(4.04)
  expect(kr?.kr.latestMonth).toBeNull()
})

test('days since update is derived from the stored timestamp', async () => {
  const db = await seeded()
  // Every real key result seeds at `updated: 0`, so asserting 0 here would
  // pass even if `daysSinceUpdate` were hard-coded, or ignored `updatedAt`
  // entirely. Backdating a specific row is what forces this through real
  // subtraction — 5 is chosen so it cannot be mistaken for a 0/1 default.
  const backdated = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
  await db.update(keyResults).set({ updatedAt: backdated }).where(eq(keyResults.id, 'k-sirket-operasyon'))

  const { depts } = await loadTree(db, await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE]))
  const kr = allKrs(depts).find(({ kr }) => kr.id === 'k-sirket-operasyon')
  expect(kr?.kr.daysSinceUpdate).toBe(5)
})

test('a key result with no monthly rows keeps its stored summary', async () => {
  const db = await seeded()
  const ids = await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE])
  const months = await openPeriodMonths(db)

  // The seeded value (0) equals `start`, so a bug that fell through to
  // `k.start` instead of the stored summary — the exact bug this bridge
  // exists to prevent — would pass this test too. A distinct value rules
  // that out.
  await db.update(keyResults).set({ current: 42 }).where(eq(keyResults.id, 'k-sat-italya'))

  // Nothing has been entered monthly, so a cutoff must not move the number:
  // this is the bridge that keeps today's screens identical.
  const { depts } = await loadTree(db, ids, cutoffOf(months[6]!))
  const kr = krById(depts, 'k-sat-italya')

  expect(kr.current).toBe(42)
  expect(kr.measuredByCutoff).toBe(true)
  expect(kr.latestMonth).toBeNull()
})

test('a cutoff sums only the months up to and including it', async () => {
  const db = await seeded()
  const ids = await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE])
  const [m1, m2, , m4] = (await openPeriodMonths(db)) as [string, string, string, string]

  await db.insert(krMonthlyValues).values([
    { id: 'kmv-cut-1', keyResultId: 'k-sat-italya', month: m1, value: 20, authorUserId: AUTHOR_USER_ID },
    { id: 'kmv-cut-2', keyResultId: 'k-sat-italya', month: m2, value: 40, authorUserId: AUTHOR_USER_ID },
    // Deliberately large and after the cutoff: if it leaked in, 60 could not be
    // mistaken for the right answer.
    { id: 'kmv-cut-3', keyResultId: 'k-sat-italya', month: m4, value: 500, authorUserId: AUTHOR_USER_ID },
  ])

  const { depts } = await loadTree(db, ids, cutoffOf(m2))
  const kr = krById(depts, 'k-sat-italya')
  expect(kr.current).toBe(60) // 20 + 40
  expect(kr.latestMonth).toBe(m2)
  expect(kr.measuredByCutoff).toBe(true)
})

test('a mid-month cutoff includes that whole month', async () => {
  const db = await seeded()
  const ids = await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE])
  const [m1] = (await openPeriodMonths(db)) as [string]

  await db.insert(krMonthlyValues).values({
    id: 'kmv-mid-1', keyResultId: 'k-sat-italya', month: m1, value: 40, authorUserId: AUTHOR_USER_ID,
  })

  // Data is entered per calendar month, so the 1st and the 28th are the same
  // cutoff — the "touched months" rule `monthsInRange` already applies to ranges.
  const early = await loadTree(db, ids, `${m1}-01`)
  const late = await loadTree(db, ids, `${m1}-28`)
  expect(krById(early.depts, 'k-sat-italya').current).toBe(40)
  expect(krById(late.depts, 'k-sat-italya').current).toBe(40)
})

test('a key result with rows but none up to the cutoff is unmeasured, not zero', async () => {
  const db = await seeded()
  const ids = await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE])
  const [m1, , m3] = (await openPeriodMonths(db)) as [string, string, string]

  // k-msf-nps seeds at start 73 (avg rule) — a non-zero start, chosen so a
  // bug that fell through to a bare 0 instead of `k.start` cannot be
  // mistaken for the right answer (k-sat-italya's start of 0 would not catch
  // that bug at all).
  await db.insert(krMonthlyValues).values({
    id: 'kmv-late-1', keyResultId: 'k-msf-nps', month: m3, value: 60, authorUserId: AUTHOR_USER_ID,
  })

  const { depts } = await loadTree(db, ids, cutoffOf(m1))
  const kr = krById(depts, 'k-msf-nps')
  expect(kr.current).toBe(73)
  expect(kr.measuredByCutoff).toBe(false)
  expect(kr.latestMonth).toBeNull()
})

test('omitting the cutoff keeps the stored summary even when monthly rows exist', async () => {
  const db = await seeded()
  const ids = await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE])
  const [m1] = (await openPeriodMonths(db)) as [string]

  // Distinct from both `start` (0) and the inserted monthly row's value (20) —
  // otherwise a bug that read the monthly row, or fell through to `start`,
  // instead of the stored summary could pass this test too.
  await db.update(keyResults).set({ current: 42 }).where(eq(keyResults.id, 'k-sat-italya'))
  await db.insert(krMonthlyValues).values({
    id: 'kmv-omit-1', keyResultId: 'k-sat-italya', month: m1, value: 20, authorUserId: AUTHOR_USER_ID,
  })

  // The untouched callers (check-in candidates, admin) must be byte-identical.
  const { depts } = await loadTree(db, ids)
  const kr = krById(depts, 'k-sat-italya')
  expect(kr.current).toBe(42)
  expect(kr.latestMonth).toBeNull()
  expect(kr.measuredByCutoff).toBe(true)
})

test('measuredOnly drops unmeasured key results and leaves the rest', async () => {
  const db = await seeded()
  const ids = await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE])
  const [m1, , m3] = (await openPeriodMonths(db)) as [string, string, string]

  await db.insert(krMonthlyValues).values({
    id: 'kmv-mo-1', keyResultId: 'k-sat-italya', month: m3, value: 60, authorUserId: AUTHOR_USER_ID,
  })

  const { depts } = await loadTree(db, ids, cutoffOf(m1))
  const before = allKrs(depts).map(({ kr }) => kr.id)
  const after = allKrs(measuredOnly(depts)).map(({ kr }) => kr.id)

  // The only key result with rows has none up to the cutoff, so it drops out;
  // every other key result is on the summary bridge and survives.
  expect(before).toContain('k-sat-italya')
  expect(after).not.toContain('k-sat-italya')
  expect(after).toHaveLength(before.length - 1)
})

test('each key result takes its months from its own period, not a shared list', async () => {
  const db = await seeded()
  const closed = (await allPeriods(db)).find((p) => p.code === SEED_CLOSED_PERIOD_CODE)
  if (!closed) throw new Error('seed has no closed period')

  await db.insert(objectives).values({
    id: 'o-cutoff-test',
    code: 'OC1',
    departmentId: 'satis',
    periodId: closed.id,
    titleTr: 'Kesit testi hedefi',
    titleEn: 'Cutoff test objective',
    ownerUserId: null,
  })
  await db.insert(keyResults).values({
    id: 'k-cutoff-test',
    objectiveId: 'o-cutoff-test',
    titleTr: 'Kesit KR',
    titleEn: 'Cutoff KR',
    start: 0,
    current: 0,
    target: 100,
    unit: '',
    confidence: 'mid',
    ownerUserId: null,
    rollup: 'sum',
  })

  const closedMonths = monthsOfPeriod(closed.startsOn, closed.endsOn)
  const closedMonth = closedMonths[1]!
  const earlierClosedMonth = closedMonths[0]!

  // Distinct from both `start` (0) and the planted row's value (70), so the
  // bridge assertion below cannot be satisfied by either a fall-through to
  // `start` or a leak of the other period's month.
  await db.update(keyResults).set({ current: 42 }).where(eq(keyResults.id, 'k-sat-italya'))

  await db.insert(krMonthlyValues).values([
    { id: 'kmv-own-1', keyResultId: 'k-cutoff-test', month: closedMonth, value: 10, authorUserId: AUTHOR_USER_ID },
    // A row for the OPEN period's key result, but filed under a month that
    // belongs to the CLOSED period's calendar — never a month k-sat-italya's
    // own period could produce. A shared month list (closed + open periods'
    // months, filtered to the cutoff) would still include this month and sum
    // the 70 in; the per-period version cannot see it at all, because it
    // never looks outside k-sat-italya's own period's months.
    { id: 'kmv-own-2', keyResultId: 'k-sat-italya', month: earlierClosedMonth, value: 70, authorUserId: AUTHOR_USER_ID },
  ])

  const ids = await idsOf(db, [SEED_CLOSED_PERIOD_CODE, SEED_OBJECTIVE_PERIOD_CODE])
  // The cutoff sits inside the CLOSED period, which ends before the open one starts.
  const { depts } = await loadTree(db, ids, cutoffOf(closedMonth))

  // The closed period's key result reports its own month. The open period's
  // only row sits outside its own period entirely, so it is an orphan and
  // takes the summary bridge — never credited with the other period's 70.
  expect(krById(depts, 'k-cutoff-test').current).toBe(10)
  expect(krById(depts, 'k-sat-italya').current).toBe(42)
  expect(krById(depts, 'k-sat-italya').measuredByCutoff).toBe(true)
})

test('a row outside the key result’s own period leaves it measured on the summary bridge', async () => {
  const db = await seeded()
  const ids = await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE])
  const months = await openPeriodMonths(db)
  const [m1] = months as [string]

  // The month a check-in taken one day after the fiscal year's last day would
  // write: periods do not auto-close, so `checkins.ts` stamps today's month
  // with no period check and the row lands past `endsOn`. Derived from the
  // period rather than hard-coded so it cannot drift out of the seed's year.
  const lastMonth = months[months.length - 1]!
  const [year, month] = lastMonth.split('-').map(Number) as [number, number]
  const afterPeriod = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7)
  expect(months, 'the orphan month must really be outside the period').not.toContain(afterPeriod)

  // All 63 seeded key results have `current === start`, so leaving the summary
  // at its seeded 0 would let the bug this test rules out — falling through to
  // `k.start` — pass. 42 is distinct from `start` (0) and from the orphan row's
  // own value (70), so only the stored summary can produce it.
  await db.update(keyResults).set({ current: 42 }).where(eq(keyResults.id, 'k-sat-italya'))
  await db.insert(krMonthlyValues).values({
    id: 'kmv-orphan-1', keyResultId: 'k-sat-italya', month: afterPeriod, value: 70, authorUserId: AUTHOR_USER_ID,
  })

  const { depts } = await loadTree(db, ids, cutoffOf(m1))
  const kr = krById(depts, 'k-sat-italya')

  // `recomputeSummary` folds every row for a key result into the summary with
  // no period filter, so the summary already accounts for the orphan — showing
  // it is showing the best figure that exists, and the key result stays in
  // every average instead of silently vanishing from its objective.
  expect(kr.current).toBe(42)
  expect(kr.measuredByCutoff).toBe(true)
  expect(kr.latestMonth).toBeNull()
  expect(allKrs(measuredOnly(depts)).map(({ kr }) => kr.id)).toContain('k-sat-italya')
})

test('rows inside the period but all after the cutoff still read as unmeasured', async () => {
  const db = await seeded()
  const ids = await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE])
  const [m1, , m3] = (await openPeriodMonths(db)) as [string, string, string]

  // The distinction the orphan bridge must NOT swallow: this row is inside the
  // key result's own period, it simply has not happened by the cutoff yet. If
  // the bridge widened from "no row in the period" to "no row up to the
  // cutoff", `current` would read 42 and the key result would stay in the
  // averages — so 42 here is what proves the two cases stayed apart.
  await db.update(keyResults).set({ current: 42 }).where(eq(keyResults.id, 'k-sat-italya'))
  await db.insert(krMonthlyValues).values({
    id: 'kmv-3a-1', keyResultId: 'k-sat-italya', month: m3, value: 70, authorUserId: AUTHOR_USER_ID,
  })

  const { depts } = await loadTree(db, ids, cutoffOf(m1))
  const kr = krById(depts, 'k-sat-italya')

  expect(kr.current).toBe(0) // `start`, not the stored summary and not 70
  expect(kr.measuredByCutoff).toBe(false)
  expect(kr.latestMonth).toBeNull()
  expect(allKrs(measuredOnly(depts)).map(({ kr }) => kr.id)).not.toContain('k-sat-italya')
})

test('a cutoff averages an avg-rule key result over exactly its own filled months', async () => {
  const db = await seeded()
  const ids = await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE])
  const [m1, m2, m3] = (await openPeriodMonths(db)) as [string, string, string]

  // k-sirket-roas: avg rule, start 4.25, target 5.3 (lib/db/seed-data.ts) —
  // exercises `loadTree` actually passing `k.rollup` (avg) together with the
  // right months, not just the `sum` KRs every other cutoff test above uses.
  await db.insert(krMonthlyValues).values([
    { id: 'kmv-avg-1', keyResultId: 'k-sirket-roas', month: m1, value: 4.4, authorUserId: AUTHOR_USER_ID },
    { id: 'kmv-avg-2', keyResultId: 'k-sirket-roas', month: m2, value: 4.5, authorUserId: AUTHOR_USER_ID },
    { id: 'kmv-avg-3', keyResultId: 'k-sirket-roas', month: m3, value: 5.0, authorUserId: AUTHOR_USER_ID },
  ])

  const { depts } = await loadTree(db, ids, cutoffOf(m3))
  const kr = krById(depts, 'k-sirket-roas')
  expect(kr.current).toBeCloseTo((4.4 + 4.5 + 5.0) / 3)
  expect(kr.measuredByCutoff).toBe(true)
})

test('a cutoff after the last filled month reports a stale latestMonth for a last-rule key result', async () => {
  const db = await seeded()
  const ids = await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE])
  const [m1, m2, , m4] = (await openPeriodMonths(db)) as [string, string, string, string]

  // k-sirket-marka: last rule, start 4.04, target 4.8. Filled through m2 only
  // — m3 is deliberately left empty and the cutoff sits at m4, so the
  // reported figure is provably stale: this is exactly the "son veri: Eyl
  // 2025" scenario `latestMonth`'s doc block advertises, which no other
  // cutoff test above (all on a `sum` KR whose cutoff month is its own
  // latest filled month) exercises.
  await db.insert(krMonthlyValues).values([
    { id: 'kmv-last-1', keyResultId: 'k-sirket-marka', month: m1, value: 4.1, authorUserId: AUTHOR_USER_ID },
    { id: 'kmv-last-2', keyResultId: 'k-sirket-marka', month: m2, value: 4.2, authorUserId: AUTHOR_USER_ID },
  ])

  const { depts } = await loadTree(db, ids, cutoffOf(m4))
  const kr = krById(depts, 'k-sirket-marka')
  expect(kr.current).toBe(4.2)
  expect(kr.latestMonth).toBe(m2)
  expect(kr.measuredByCutoff).toBe(true)
})
