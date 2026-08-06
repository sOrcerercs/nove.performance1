import { cache } from 'react'
import { asc } from 'drizzle-orm'
import type { Db } from '@/lib/db'
import { departments, keyResults, objectives, periods, users } from '@/lib/db/schema'

/**
 * The five tables every authenticated screen reads, fetched at most once per
 * request.
 *
 * Next renders a layout and its page as separate server components, so both
 * used to issue their own copy of these selects: one overview render cost
 * sixteen statements and read `periods` five times. Beyond the wasted latency
 * that was a correctness hazard — the selects are fired concurrently, and a
 * transaction-mode connection pooler queues any statement past the pool's
 * connection count without ever running it, so a request that fanned out wide
 * enough would hang instead of erroring.
 *
 * Everything here is a whole-table read on purpose. The sidebar shows progress
 * for *every* period at once, so a period-filtered query cannot serve it; and
 * the entire dataset is under a hundred rows, so one flat read per table beats
 * any join. Callers filter and shape in memory.
 */

/**
 * One memo table per server request.
 *
 * `cache()` is what scopes this to a request rather than to the process — a
 * module-level Map would leak one request's rows into the next. Outside a
 * request React hands back a fresh Map on every call, which is why tests use
 * `withRequestScope` to pin one.
 */
const reactScope = cache((): Map<string, Promise<unknown>> => new Map())

let overrideScope: Map<string, Promise<unknown>> | null = null

/**
 * Runs `fn` against one explicit memo scope.
 *
 * Only tests need this: they run outside a request, where `cache()` does not
 * memoise, so without it there is no way to observe the deduplication.
 */
export async function withRequestScope<T>(fn: () => Promise<T>): Promise<T> {
  const previous = overrideScope
  overrideScope = new Map()
  try {
    return await fn()
  } finally {
    overrideScope = previous
  }
}

/**
 * Memoises by table name alone, not by `db`. A request talks to exactly one
 * database, so the connection cannot vary within a scope.
 */
function once<T>(key: string, load: () => PromiseLike<T>): Promise<T> {
  const scope = overrideScope ?? reactScope()
  const inFlight = scope.get(key) as Promise<T> | undefined
  if (inFlight) return inFlight

  // Drizzle's query builders are lazy thenables, not promises: awaiting one
  // twice runs the statement twice. Settling it into a real promise here is
  // what makes the memo actually memoise rather than hand every caller the
  // same re-executable builder.
  const promise = (async () => await load())()
  scope.set(key, promise)
  return promise
}

export type PeriodRow = typeof periods.$inferSelect
export type DepartmentRow = typeof departments.$inferSelect
export type ObjectiveRow = typeof objectives.$inferSelect
export type KeyResultRow = typeof keyResults.$inferSelect
/** Deliberately excludes `passwordHash`: no render path has any use for it. */
export type UserRow = Pick<
  typeof users.$inferSelect,
  'id' | 'name' | 'email' | 'role' | 'departmentId' | 'state'
>

/** Oldest first — the order the period picker lists them in. */
export const allPeriods = (db: Db): Promise<PeriodRow[]> =>
  once('periods', () => db.select().from(periods).orderBy(asc(periods.startsOn)))

export const allDepartments = (db: Db): Promise<DepartmentRow[]> =>
  once('departments', () => db.select().from(departments).orderBy(asc(departments.sortOrder)))

export const allUsers = (db: Db): Promise<UserRow[]> =>
  once('users', () =>
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        departmentId: users.departmentId,
        state: users.state,
      })
      .from(users),
  )

export const allObjectives = (db: Db): Promise<ObjectiveRow[]> =>
  once('objectives', () => db.select().from(objectives).orderBy(asc(objectives.code)))

export const allKeyResults = (db: Db): Promise<KeyResultRow[]> =>
  once('key_results', () => db.select().from(keyResults).orderBy(asc(keyResults.id)))
