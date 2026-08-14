import { expect, test } from 'vitest'
import { createTestDb, type Db } from '@/lib/db'
import { krMonthlyValues } from '@/lib/db/schema'
import { seed } from '@/lib/db/seed'
import { SEED_OBJECTIVE_PERIOD_CODE } from '@/lib/db/seed-data'
import { monthsOfPeriod } from '@/lib/domain/monthly'
import { getDepartment } from '../department'
import { getSidebarData } from '../sidebar'
import { allDepartments, allPeriods } from '../tables'
import { loadTree } from '../tree'

async function seeded() {
  const db = await createTestDb()
  await seed(db)
  return db
}

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

/** Which department a key result lives in — derived, so a seed reshuffle cannot
 *  silently point this test at the wrong department. */
async function deptSlugOfKr(db: Db, ids: string[], krId: string): Promise<string> {
  const { depts } = await loadTree(db, ids)
  const found = depts.find((d) => d.objectives.some((o) => o.krs.some((k) => k.id === krId)))
  if (!found) throw new Error(`key result ${krId} is in no department`)
  return found.slug
}

const AUTHOR_USER_ID = 'u-kagan.ozturk'

/** A cutoff landing inside `month`, day immaterial (`loadTree` truncates it). */
const cutoffOf = (month: string): string => `${month}-15`

test('the sidebar percentage is exactly the department page’s percentage', async () => {
  const db = await seeded()
  const ids = await idsOf(db, [SEED_OBJECTIVE_PERIOD_CODE])
  // The seed's open period is a fiscal year (twelve months), not a quarter —
  // indexed rather than tuple-destructured so the type does not misstate that.
  const months = await openPeriodMonths(db)
  const m1 = months[0]!
  const m3 = months[2]!

  await db.insert(krMonthlyValues).values({
    id: 'kmv-side-1', keyResultId: 'k-sat-italya', month: m1, value: 20, authorUserId: AUTHOR_USER_ID,
  })

  const slug = await deptSlugOfKr(db, ids, 'k-sat-italya')
  const sidebar = await getSidebarData(db, ids, cutoffOf(m3))
  const dept = await getDepartment(db, slug, ids, cutoffOf(m3))

  // The whole reason the range now reaches the layout: one URL, one number.
  expect(sidebar.pctBySlug[slug]).toBe(dept!.pct)
})

test('an empty range still lists every department, at 0', async () => {
  const db = await seeded()
  const months = await openPeriodMonths(db)
  const data = await getSidebarData(db, [], cutoffOf(months[0]!))

  // A department the sidebar drops is one nobody can click to — pinned
  // against the full table, not just "at least one", so a fallback that
  // silently narrows the list (a single department, or half of them) would
  // still be caught rather than passing on a `length > 0` technicality.
  const everySlug = (await allDepartments(db)).map((d) => d.slug).sort()
  expect(data.depts.map((d) => d.slug).sort()).toEqual(everySlug)
  for (const d of data.depts) expect(data.pctBySlug[d.slug]).toBe(0)
})
