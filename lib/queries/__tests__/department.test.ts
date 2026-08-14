import { and, eq, ne, sql } from 'drizzle-orm'
import { expect, test } from 'vitest'
import { createTestDb, type Db } from '@/lib/db'
import { keyResults, krMonthlyValues } from '@/lib/db/schema'
import { seed } from '@/lib/db/seed'
import { SEED_OBJECTIVE_PERIOD_CODE } from '@/lib/db/seed-data'
import { monthsOfPeriod } from '@/lib/domain/monthly'
import { getDepartment, getDepartmentForPage, getObjective } from '../department'
import { allPeriods } from '../tables'
import { loadTree } from '../tree'

/** Period ids for a list of codes — the queries take ids, the seed exports codes. */
async function idsOf(db: Db, codes: string[]) {
  const rows = await allPeriods(db)
  return rows.filter((p) => codes.includes(p.code)).map((p) => p.id)
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

test('an unknown slug yields null rather than an empty department', async () => {
  const db = await seeded()
  expect(await getDepartment(db, 'yok-boyle-bir-bolum', await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE]))).toBeNull()
})

test('a department carries its objectives, key results and rolled-up progress', async () => {
  const db = await seeded()
  const sirket = await getDepartment(db, 'sirket', await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE]))

  expect(sirket).not.toBeNull()
  expect(sirket?.emoji).toBe('🏢')
  expect(sirket?.nameTr).toBe('Şirket')
  expect(sirket?.nameEn).toBe('Company')
  // No per-person ownership in the source workbook — resolves to '', not a
  // stale id.
  expect(sirket?.leadName).toBe('')
  expect(sirket?.pct).toBe(0)
  expect(sirket?.objectives).toHaveLength(1)
  expect(sirket?.objectives[0]?.krs).toHaveLength(5)
})

test('a department with two objectives averages them unweighted', async () => {
  const db = await seeded()

  // medikal has O1 (2 KRs, both target 0→9.2 and 0→8.5) and O2 (4 KRs, all
  // target 0→something). Push O1's two KRs to their targets (100% each) and
  // leave O2's four KRs untouched (0% each, current === start from the seed).
  //
  //   unweighted (mean of objective percentages): mean(100, 0)              = 50
  //   flat/weighted (mean over all 6 key results): mean(100,100,0,0,0,0)/6  = 33
  //
  // Only the unweighted route reaches 50 — a weighted mean over all key
  // results would land on 33, so this number distinguishes the two algorithms
  // rather than merely documenting the KR-count shape.
  await db.update(keyResults).set({ current: 9.2 }).where(eq(keyResults.id, 'k-med-skor9'))
  await db.update(keyResults).set({ current: 8.5 }).where(eq(keyResults.id, 'k-med-genel9'))

  const medikal = await getDepartment(db, 'medikal', await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE]))

  expect(medikal?.objectives).toHaveLength(2)
  expect(medikal?.pct).toBe(50)
  expect(medikal?.objectives.map((o) => o.code)).toEqual(['O1', 'O2'])
  expect(medikal?.objectives.map((o) => o.krs.length)).toEqual([2, 4])
})

test('key result view models are serialisable and carry their own progress', async () => {
  const db = await seeded()
  const hastaOp = await getDepartment(db, 'hasta-op', await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE]))
  const kr = hastaOp?.objectives.flatMap((o) => o.krs).find((kr) => kr.id === 'k-hop-sarf')

  expect(kr).toMatchObject({
    titleEn: 'Keep consumables per patient within 110% of budget',
    start: 110,
    current: 110,
    target: 100,
    unit: '%',
    confidence: 'mid',
    // No owner assigned yet.
    ownerName: '',
    // Never touched since seeding.
    daysSinceUpdate: 0,
  })
  // current === start everywhere in the real dataset (actuals were
  // deliberately not imported), so every key result reads 0% regardless of
  // its start/target span — including this reduction goal with a negative one.
  expect(kr?.pct).toBe(0)
  // Nothing that would break the server → client boundary.
  expect(JSON.parse(JSON.stringify(kr))).toEqual(kr)
})

test('an objective resolves owner names for itself and its key results', async () => {
  const db = await seeded()
  const obj = await getObjective(db, 'o-sat-1', await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE]))

  expect(obj?.code).toBe('O1')
  expect(obj?.titleTr).toBe('Hasta sayısını artır')
  // Nobody owns anything yet — every name must resolve to '', consistently
  // across all six key results, not a dangling id.
  expect(obj?.ownerName).toBe('')
  expect(obj?.pct).toBe(0)
  expect(obj?.krs.map((kr) => kr.ownerName)).toEqual(['', '', '', '', '', ''])
})

test('an objective knows the department it belongs to', async () => {
  const db = await seeded()
  const obj = await getObjective(db, 'o-fin-2', await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE]))

  expect(obj?.deptSlug).toBe('finans')
  expect(obj?.deptEmoji).toBe('💰')
  expect(obj?.deptNameTr).toBe('Finans')
  expect(obj?.deptNameEn).toBe('Finance')
})

test('an unknown objective id yields null', async () => {
  const db = await seeded()
  expect(await getObjective(db, 'o-yok', await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE]))).toBeNull()
})

test('an unknown period leaves both lookups empty rather than throwing', async () => {
  const db = await seeded()
  expect(await getDepartment(db, 'satis', [])).toBeNull()
  expect(await getObjective(db, 'o-sat-1', [])).toBeNull()
})

/**
 * `getDepartmentForPage` is what `app/(app)/bolum/[slug]/page.tsx` calls
 * instead of `getDepartment` directly — it is what fixed a reachable 404: the
 * `prevFy` preset (or any range covering no seeded periods) matched zero
 * periods, `loadTree` short-circuited to no departments at all, and a real
 * slug like `saha` came back `null` from `getDepartment` exactly like a fake
 * one — so the page 404'd on a department the sidebar still listed.
 */
test('a range matching no periods renders the department empty, not 404', async () => {
  const db = await seeded()
  const result = await getDepartmentForPage(db, 'satis', [])

  expect(result.kind).toBe('empty-range')
  if (result.kind !== 'empty-range') return
  expect(result.dept.slug).toBe('satis')
  expect(result.dept.nameTr).toBe('Satış')
  expect(result.dept.leadName).toBe('')
  expect(result.dept.objectives).toEqual([])
  expect(result.dept.pct).toBe(0)
})

test('an unknown slug still 404s even when the range matches no periods', async () => {
  const db = await seeded()
  expect((await getDepartmentForPage(db, 'yok-boyle-bir-bolum', [])).kind).toBe('not-found')
})

test('a range that does match periods still resolves the department normally', async () => {
  const db = await seeded()
  const ids = await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE])
  const result = await getDepartmentForPage(db, 'satis', ids)

  expect(result.kind).toBe('ok')
  if (result.kind !== 'ok') return
  expect(result.dept.pct).toBe(0)
  expect(result.dept.objectives).toHaveLength(2)
})

/** Which department a key result lives in — derived, so a seed reshuffle cannot
 *  silently point this test at the wrong department. */
async function deptSlugOfKr(db: Db, ids: string[], krId: string): Promise<string> {
  const { depts } = await loadTree(db, ids)
  const found = depts.find((d) => d.objectives.some((o) => o.krs.some((k) => k.id === krId)))
  if (!found) throw new Error(`key result ${krId} is in no department`)
  return found.slug
}

test('a key result reports the month its figure came from', async () => {
  const db = await seeded()
  const ids = await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE])
  const [m1, , m3] = (await openPeriodMonths(db)) as [string, string, string]

  await db.insert(krMonthlyValues).values({
    id: 'kmv-dept-1', keyResultId: 'k-sat-italya', month: m1, value: 20, authorUserId: AUTHOR_USER_ID,
  })

  const slug = await deptSlugOfKr(db, ids, 'k-sat-italya')
  const dept = await getDepartment(db, slug, ids, cutoffOf(m3))
  const kr = dept!.objectives.flatMap((o) => o.krs).find((k) => k.id === 'k-sat-italya')!

  expect(kr.current).toBe(20)
  expect(kr.latestMonth).toBe(m1)
})

test('a key result on the summary bridge reports no month', async () => {
  const db = await seeded()
  const ids = await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE])
  const months = await openPeriodMonths(db)

  const slug = await deptSlugOfKr(db, ids, 'k-sat-italya')
  const dept = await getDepartment(db, slug, ids, cutoffOf(months[6]!))
  const kr = dept!.objectives.flatMap((o) => o.krs).find((k) => k.id === 'k-sat-italya')!

  expect(kr.latestMonth).toBeNull()
})

test('excluding an unmeasured key result moves the percentage, not just a count', async () => {
  const db = await seeded()
  const ids = await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE])
  const [m1, , m3] = (await openPeriodMonths(db)) as [string, string, string]

  // The exclusion is only observable when something is actually unmeasured
  // beside something measured in the SAME objective — otherwise `measuredKrsOf`
  // filters nothing and could be deleted outright with every other assertion
  // still holding. This is the test that makes the exclusion load-bearing.
  const [row] = await db
    .select({ objectiveId: keyResults.objectiveId })
    .from(keyResults)
    .where(eq(keyResults.id, 'k-sat-italya'))

  // k-sat-italya's objective (o-sat-1) has five other key results, all still
  // sitting at their seeded 0%. Left alone they would dilute `objPct`'s mean
  // to ~17%, which would fail the 100%/50% assertions below for a reason that
  // has nothing to do with the exclusion this test exists to pin — the same
  // isolation technique overview.test.ts's cumulative-sum test uses. This has
  // to run BEFORE `k-not-yet` is inserted: the update is scoped to the whole
  // objective, and `k-not-yet` needs to stay measurable (target 100, start 0)
  // so it can be genuinely unmeasured-by-cutoff rather than unmeasurable —
  // inserting it first would catch it in this same update and make the
  // exclusion this test pins untestable.
  await db
    .update(keyResults)
    .set({ target: sql`${keyResults.start}` })
    .where(and(eq(keyResults.objectiveId, row!.objectiveId), ne(keyResults.id, 'k-sat-italya')))

  await db.insert(keyResults).values({
    id: 'k-not-yet',
    objectiveId: row!.objectiveId,
    titleTr: 'Henüz ölçülmedi',
    titleEn: 'Not measured yet',
    start: 0,
    current: 0,
    target: 100,
    unit: '',
    confidence: 'mid',
    ownerUserId: null,
    rollup: 'sum',
  })
  await db.insert(krMonthlyValues).values([
    // Measured by the cutoff, and all the way to target: 100%.
    { id: 'kmv-pct-1', keyResultId: 'k-sat-italya', month: m1, value: 200, authorUserId: AUTHOR_USER_ID },
    // Has data, but only after the cutoff — unmeasured at this cutoff.
    { id: 'kmv-pct-2', keyResultId: 'k-not-yet', month: m3, value: 50, authorUserId: AUTHOR_USER_ID },
  ])

  const slug = await deptSlugOfKr(db, ids, 'k-sat-italya')
  const dept = await getDepartment(db, slug, ids, cutoffOf(m1))
  const objective = dept!.objectives.find((o) => o.krs.some((k) => k.id === 'k-sat-italya'))!

  // Excluded, the objective is 100%. Counted as 0%, it would be 50%.
  expect(objective.pct).toBe(100)
  // The unmeasured row is still listed — it just does not move the number.
  expect(objective.krs.map((k) => k.id)).toContain('k-not-yet')
})
