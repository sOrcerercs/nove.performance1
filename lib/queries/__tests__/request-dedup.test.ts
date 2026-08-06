import { expect, test } from 'vitest'
import { createTestDb, type Db } from '@/lib/db'
import { seed } from '@/lib/db/seed'
import { SEED_OBJECTIVE_PERIOD_CODE } from '@/lib/db/seed-data'
import type { SessionUser } from '@/lib/auth/permissions'
import { getCheckinCandidates } from '../checkin'
import { getDepartment } from '../department'
import { getOverview } from '../overview'
import { resolvePeriod } from '../periods'
import { getSidebarData } from '../sidebar'
import { withRequestScope } from '../tables'

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
 * One request must read each table once.
 *
 * The overview screen's layout and page both need the period list and the OKR
 * tree. Without request-level memoisation each recomputes them, so a single
 * render issued sixteen statements and read `key_results` three times. That is
 * not just wasted latency: the queries are fired concurrently, and against a
 * transaction-mode connection pooler any request that puts more statements in
 * flight than the pool has connections queues forever instead of erroring.
 * Keeping the roundtrip count at one per table is what keeps that from
 * happening again.
 */
test('rendering the overview reads each table at most once', async () => {
  const { db, tally } = await countingDb()

  await withRequestScope(async () => {
    // Exactly what app/(app)/layout.tsx runs.
    const selection = await resolvePeriod(db, undefined)
    const defaultPeriod = selection?.current.code ?? ''
    await Promise.all([getSidebarData(db), getCheckinCandidates(db, admin, defaultPeriod)])

    // Then what app/(app)/page.tsx runs, for the same period.
    await resolvePeriod(db, defaultPeriod)
    await getOverview(db, defaultPeriod)
  })

  const counts = tally()
  for (const [table, n] of counts) {
    expect(n, `${table} was read ${n} times in one request`).toBe(1)
  }
  // Five tables, five statements — the whole screen.
  expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(5)
})

test('rendering a department page reads each table at most once', async () => {
  const { db, tally } = await countingDb()

  await withRequestScope(async () => {
    const selection = await resolvePeriod(db, undefined)
    const period = selection?.current.code ?? ''
    await Promise.all([getSidebarData(db), getCheckinCandidates(db, admin, period)])

    await resolvePeriod(db, period)
    await getDepartment(db, 'saha', period)
  })

  const counts = tally()
  for (const [table, n] of counts) {
    expect(n, `${table} was read ${n} times in one request`).toBe(1)
  }
})

test('each request scope reads afresh, so writes are never served stale', async () => {
  const { db, tally } = await countingDb()

  await withRequestScope(() => resolvePeriod(db, undefined))
  await withRequestScope(() => resolvePeriod(db, undefined))

  // Memoisation is per request, not per process: two requests, two reads.
  expect(tally().get('periods')).toBe(2)
})

test('the overview still renders correctly off the shared reads', async () => {
  const { db } = await countingDb()
  const vm = await withRequestScope(() => getOverview(db, SEED_OBJECTIVE_PERIOD_CODE))

  expect(vm.companyPct).toBe(51)
  expect(vm.kpis).toEqual({ depts: 8, objectives: 9, krs: 25, avgPct: 51, openKrs: 17 })
})
