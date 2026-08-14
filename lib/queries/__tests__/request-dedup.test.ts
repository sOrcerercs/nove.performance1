import { expect, test } from 'vitest'
import { createTestDb, type Db } from '@/lib/db'
import { seed } from '@/lib/db/seed'
import { SEED_OBJECTIVE_PERIOD_CODE } from '@/lib/db/seed-data'
import { asOfCutoff } from '@/lib/domain/dates'
import type { SessionUser } from '@/lib/auth/permissions'
import { getAdminData } from '../admin'
import { getCheckinCandidates } from '../checkin'
import { getDepartment } from '../department'
import { getMonthlyEntryVm } from '../monthly'
import { getOverview } from '../overview'
import { getAssignablePeople } from '../people'
import { activePeriodOf, resolveRange, type PeriodOption } from '../range'
import { getSidebarData } from '../sidebar'
import { allPeriods, withRequestScope } from '../tables'
import { loadTree } from '../tree'

const admin: SessionUser = {
  id: 'u-admin',
  name: 'Admin',
  email: 'admin@example.com',
  role: 'admin',
  departmentId: null,
}

/** Seeds a database that records every statement it is asked to run. */
async function countingDb(): Promise<{ db: Db; tally: () => Map<string, number> }> {
  const seen: string[] = []
  let recording = false
  const db = await createTestDb({
    onQuery: (sql) => {
      if (recording) seen.push(sql)
    },
  })
  await seed(db)
  recording = true

  return {
    db,
    tally: () => {
      const counts = new Map<string, number>()
      for (const sql of seen) {
        const table = sql.match(/from "(\w+)"/)?.[1]
        if (table) counts.set(table, (counts.get(table) ?? 0) + 1)
      }
      return counts
    },
  }
}

/**
 * The open period, derived the same way `app/(app)/layout.tsx` derives it:
 * from every period, not the range-filtered set. Check-in must stay scoped to
 * the period open right now regardless of which range the page is showing,
 * so the test has to reproduce that exact two-step or it cannot catch a
 * regression where the layout started scoping check-in off the filtered list.
 */
async function openPeriodOfEveryPeriod(db: Db) {
  const everyPeriod: PeriodOption[] = (await allPeriods(db)).map((p) => ({
    id: p.id,
    code: p.code,
    kind: p.kind,
    state: p.state,
    startsOn: p.startsOn,
    endsOn: p.endsOn,
  }))
  return activePeriodOf(everyPeriod)
}

/**
 * One request must read each table once.
 *
 * Reproduces exactly what `app/(app)/layout.tsx` then `app/(app)/page.tsx`
 * run for one request: the layout resolves the range, separately reads every
 * period to find the period open right now (independent of the range, so a
 * past filter can never change which period check-in targets), then the
 * page resolves the range again for its own query. Without request-level
 * memoisation each of those recomputes its reads, so a single render issued
 * sixteen statements and read `key_results` three times. That is not just
 * wasted latency: the queries are fired concurrently, and against a
 * transaction-mode connection pooler any request that puts more statements in
 * flight than the pool has connections queues forever instead of erroring.
 * Keeping the roundtrip count at one per table is what keeps that from
 * happening again.
 */
test('rendering the overview reads each table at most once', async () => {
  const { db, tally } = await countingDb()

  await withRequestScope(async () => {
    // Exactly what app/(app)/layout.tsx runs: it resolves the range (the
    // sidebar now computes off it directly) and, separately, the open period
    // off every period (for check-in scoping) — two different derivations
    // from the same reads.
    const selection = await resolveRange(db, undefined)
    const openPeriod = await openPeriodOfEveryPeriod(db)
    await Promise.all([
      getSidebarData(db, selection.periods.map((p) => p.id), asOfCutoff(selection.range.to)),
      getCheckinCandidates(db, admin, openPeriod ? [openPeriod.id] : []),
    ])

    // Then what app/(app)/page.tsx runs, for the same range — cutoff included,
    // exactly as the page passes it. Omitting it made the assertion depend on
    // the sidebar's call above having already warmed the memo.
    const page = await resolveRange(db, undefined)
    await getOverview(db, page.periods.map((p) => p.id), new Date(), asOfCutoff(page.range.to))
  })

  const counts = tally()
  for (const [table, n] of counts) {
    expect(n, `${table} was read ${n} times in one request`).toBe(1)
  }
  // Seven tables, seven statements — the five the tree needs, plus
  // app_settings for the configured default range start, plus
  // kr_monthly_values: `getOverview`'s trend now draws from real monthly
  // rollups, so it always needs that table too, whether or not any month
  // actually has data on file.
  expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(7)
})

/**
 * A render that resolves an `asOf` cutoff — the shape a screen narrowing to a
 * date range will use `loadTree` in — adds exactly one statement, for
 * `kr_monthly_values`, and still reads every table at most once. This is what
 * `lib/db/index.ts`'s pool-size comment now pins at seven rather than six.
 */
test('a render that resolves a cutoff into the tree still reads each table at most once', async () => {
  const { db, tally } = await countingDb()

  await withRequestScope(async () => {
    const selection = await resolveRange(db, undefined)
    const openPeriod = await openPeriodOfEveryPeriod(db)
    await Promise.all([
      getSidebarData(db, selection.periods.map((p) => p.id), asOfCutoff(selection.range.to)),
      getCheckinCandidates(db, admin, openPeriod ? [openPeriod.id] : []),
    ])

    const page = await resolveRange(db, undefined)
    await loadTree(db, page.periods.map((p) => p.id), page.range.to)
  })

  const counts = tally()
  for (const [table, n] of counts) {
    expect(n, `${table} was read ${n} times in one request`).toBe(1)
  }
  // Seven tables, seven statements — the six above plus kr_monthly_values,
  // read exactly once because a cutoff was resolved.
  expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(7)
})

/**
 * Same guarantee as above, for the department screen: the layout's reads plus
 * the department page's own `resolveRange` + `getDepartment` must still add
 * up to one read per table.
 */
test('rendering a department page reads each table at most once', async () => {
  const { db, tally } = await countingDb()

  await withRequestScope(async () => {
    const selection = await resolveRange(db, undefined)
    const openPeriod = await openPeriodOfEveryPeriod(db)
    await Promise.all([
      getSidebarData(db, selection.periods.map((p) => p.id), asOfCutoff(selection.range.to)),
      getCheckinCandidates(db, admin, openPeriod ? [openPeriod.id] : []),
    ])

    // The cutoff the real department page passes, not an omitted one.
    const page = await resolveRange(db, undefined)
    await getDepartment(db, 'satis', page.periods.map((p) => p.id), asOfCutoff(page.range.to))
  })

  const counts = tally()
  for (const [table, n] of counts) {
    expect(n, `${table} was read ${n} times in one request`).toBe(1)
  }
})

/**
 * Same guarantee, for the admin screen: `getAdminData` used to issue five raw
 * `db.select()` calls bypassing `./tables`'s memo entirely, concurrent with
 * `getAssignablePeople`'s own raw `users` select and the layout's fan-out —
 * together nine-odd statements in flight against a pool capped at `max: 10`,
 * one bad request away from wedging every connection forever (see the comment
 * on `postgres()` in lib/db/index.ts). Both now read through `./tables`.
 */
test('rendering the admin page reads each table at most once', async () => {
  const { db, tally } = await countingDb()

  await withRequestScope(async () => {
    const selection = await resolveRange(db, undefined)
    const openPeriod = await openPeriodOfEveryPeriod(db)
    await Promise.all([
      getSidebarData(db, selection.periods.map((p) => p.id), asOfCutoff(selection.range.to)),
      getCheckinCandidates(db, admin, openPeriod ? [openPeriod.id] : []),
    ])

    await resolveRange(db, undefined)
    await Promise.all([getAdminData(db), getAssignablePeople(db)])
  })

  const counts = tally()
  for (const [table, n] of counts) {
    expect(n, `${table} was read ${n} times in one request`).toBe(1)
  }
})

/**
 * The bulk monthly-entry screen's own request: the layout's fan-out, plus
 * the page's `resolveRange` (for the Topbar) and `getMonthlyEntryVm`. Neither
 * of those two adds a table `loadTree`-based screens do not already touch —
 * `getMonthlyEntryVm` reads periods, departments, objectives, key results and
 * monthly values, all five already read by the layout or by `loadTree`
 * elsewhere — so the total stays at the same seven tables, seven statements
 * `tree.test.ts`'s months-resolved scenario already pins.
 */
test('rendering the monthly entry page reads each table at most once', async () => {
  const { db, tally } = await countingDb()

  await withRequestScope(async () => {
    const selection = await resolveRange(db, undefined)
    const openPeriod = await openPeriodOfEveryPeriod(db)
    await Promise.all([
      getSidebarData(db, selection.periods.map((p) => p.id), asOfCutoff(selection.range.to)),
      getCheckinCandidates(db, admin, openPeriod ? [openPeriod.id] : []),
    ])

    await getMonthlyEntryVm(db, admin)
  })

  const counts = tally()
  for (const [table, n] of counts) {
    expect(n, `${table} was read ${n} times in one request`).toBe(1)
  }
  expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(7)
})

test('each request scope reads afresh, so writes are never served stale', async () => {
  const { db, tally } = await countingDb()

  await withRequestScope(() => resolveRange(db, undefined))
  await withRequestScope(() => resolveRange(db, undefined))

  // Memoisation is per request, not per process: two requests, two reads.
  expect(tally().get('periods')).toBe(2)
})

test('the overview still renders correctly off the shared reads', async () => {
  const { db } = await countingDb()
  const vm = await withRequestScope(async () => {
    const ids = (await allPeriods(db))
      .filter((p) => p.code === SEED_OBJECTIVE_PERIOD_CODE)
      .map((p) => p.id)
    return getOverview(db, ids)
  })

  expect(vm.companyPct).toBe(0)
  // 63 key results total; 2 are unmeasurable and excluded from "open to
  // development" (see lib/queries/__tests__/overview.test.ts for the detail).
  expect(vm.kpis).toEqual({ depts: 10, objectives: 26, krs: 63, measuredKrs: 63, avgPct: 0, openKrs: 61 })
})
