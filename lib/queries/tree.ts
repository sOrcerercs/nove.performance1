import type { Db } from '@/lib/db'
import { monthsOfPeriod, valueForRange } from '@/lib/domain/monthly'
import type { Confidence, RollupRule } from '@/lib/domain/types'
import {
  allDepartments,
  allKeyResults,
  allMonthlyValues,
  allObjectives,
  allPeriods,
  allUsers,
} from './tables'

export interface KrNode {
  id: string
  titleTr: string
  titleEn: string
  start: number
  current: number
  target: number
  unit: string
  confidence: Confidence
  /** How this key result's monthly values collapse into `current` — surfaced so the editor can offer it. */
  rollup: RollupRule
  /** Percent share inside the objective; null = unweighted. */
  weight: number | null
  ownerUserId: string | null
  ownerName: string
  updatedAt: Date
  /** Whole days since the last update — the prototype's "updated N days ago". */
  daysSinceUpdate: number
  /**
   * The month the reported figure was actually measured in — the latest filled
   * month at or before the cutoff. `null` when no cutoff was given, when the
   * key result is on the summary bridge (no monthly row inside its own
   * period), or when nothing was measured up to the cutoff.
   *
   * This is what lets a screen say "son veri: Eyl 2025" on a `last`-rule key
   * result whose figure is months old. `daysSinceUpdate` cannot: it says when
   * the row was last *touched*, not which month the data belongs to.
   */
  latestMonth: string | null
  /**
   * Whether `current` reflects a real measurement rather than the
   * no-data-by-the-cutoff fallback to `start`.
   *
   * Always `true` when `asOf` is omitted, and also true for the summary
   * bridge (no monthly row inside the key result's own period) — the stored
   * summary is treated as measured in both cases, exactly as every caller
   * before this field existed already assumed. Otherwise this is `false` only
   * when `valueForRange` found nothing at all up to the cutoff, the same
   * condition that makes `current` fall back to `start` a few lines below. A
   * key result nobody has measured yet is not "at 0%", it is unmeasured —
   * this is what lets a caller (`measuredKrsOf`) tell the two apart and
   * exclude the latter, without `krPct`/`isMeasurable` in
   * `lib/domain/progress.ts` having to know about "measured by this cutoff"
   * at all. Those stay the single source of truth for the *unmeasurable*
   * (`target === start`) distinction; this is a separate, narrower one.
   */
  measuredByCutoff: boolean
}

export interface ObjNode {
  id: string
  code: string
  titleTr: string
  titleEn: string
  ownerUserId: string | null
  ownerName: string
  departmentId: string
  /** Which period this objective belongs to — an objective is in exactly one. */
  periodId: string
  krs: KrNode[]
}

export interface DeptNode {
  id: string
  slug: string
  emoji: string
  nameTr: string
  nameEn: string
  leadName: string
  objectives: ObjNode[]
}

export interface PeriodInfo {
  id: string
  code: string
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Loads the OKR tree for a set of periods.
 *
 * Takes ids rather than one code because the range filter can cover several
 * quarters at once. An objective belongs to exactly one period, so the union is
 * disjoint: merging trees cannot double count, and the progress functions in
 * `lib/domain` average the merged set without changing.
 *
 * Deliberately flat reads assembled in memory rather than a join or SQL
 * aggregation: the dataset is a few dozen key results, and keeping the shaping
 * in TypeScript means progress is computed in exactly one place. The reads go
 * through `./tables`, so the layout and the page share them.
 *
 * `asOf` is a cutoff, not a window: each key result reports its state as of
 * that date, cumulative from its own period's first month — never a slice in
 * the middle. It is optional and, when omitted, changes nothing: `current`
 * stays the stored summary value, exactly as before this parameter existed.
 * Callers with no use for cutoff resolution (check-in candidates, the admin
 * screen) can stay untouched rather than ripple through this change. When
 * given, it also skips the `kr_monthly_values` read entirely — the row is
 * only fetched when a caller actually needs it, which is what keeps those
 * untouched callers' statement counts unchanged too.
 *
 * There is no `carriedFrom` on `KrNode` any more, though `valueForRange`
 * itself still has (and needs) that branch. Under a window a range could
 * start mid-period and leave `last` reaching back before it for a carried
 * figure; under a cutoff, `months` always starts at the period's first month,
 * so the months passed to `valueForRange` always include everything the carry
 * search could reach — the branch can never fire from here, and the field
 * would be permanently `null`.
 */
export async function loadTree(
  db: Db,
  periodIds: readonly string[],
  asOf?: string,
): Promise<{ periods: PeriodInfo[]; depts: DeptNode[] }> {
  const [periodRows, deptRows, userRows, allObjRows, krRows, monthlyRows] = await Promise.all([
    allPeriods(db),
    allDepartments(db),
    allUsers(db),
    allObjectives(db),
    allKeyResults(db),
    asOf ? allMonthlyValues(db) : Promise.resolve(null),
  ])

  const wanted = new Set(periodIds)
  const periods: PeriodInfo[] = periodRows
    .filter((p) => wanted.has(p.id))
    .map((p) => ({ id: p.id, code: p.code }))

  // No period matched (an empty request or ids that don't exist) — nothing to
  // render. Short-circuiting here, rather than mapping `deptRows` unconditionally
  // below, is what keeps `depts` itself empty instead of a shell of departments
  // with empty `objectives` arrays.
  if (periods.length === 0) return { periods: [], depts: [] }

  const objRows = allObjRows.filter((o) => wanted.has(o.periodId))
  const nameById = new Map(userRows.map((u) => [u.id, u.name]))
  const now = Date.now()

  // Cheap in-memory indexes over rows already read above, so they are built
  // unconditionally; only the cutoff branch below actually reads them.
  const periodById = new Map(periodRows.map((p) => [p.id, p]))
  const periodIdByObjective = new Map(allObjRows.map((o) => [o.id, o.periodId]))
  const periodMonthsCache = new Map<string, string[]>()
  const periodMonthsOf = (periodId: string): string[] => {
    const cached = periodMonthsCache.get(periodId)
    if (cached) return cached
    const period = periodById.get(periodId)
    const result = period ? monthsOfPeriod(period.startsOn, period.endsOn) : []
    periodMonthsCache.set(periodId, result)
    return result
  }
  const byMonthByKr = new Map<string, Map<string, number>>()
  // Data is entered per calendar month, so a cutoff anywhere inside a month
  // includes that whole month — the same rule `monthsInRange` applies to a
  // range's ends. Truncating here, once, is what makes `2026-03-01` and
  // `2026-03-31` the same cutoff and keeps the four callers from each having to
  // remember to slice.
  const asOfMonth = asOf?.slice(0, 7)
  if (asOfMonth && monthlyRows) {
    for (const row of monthlyRows) {
      let byMonth = byMonthByKr.get(row.keyResultId)
      if (!byMonth) {
        byMonth = new Map()
        byMonthByKr.set(row.keyResultId, byMonth)
      }
      byMonth.set(row.month, row.value)
    }
  }

  const krsByObjective = new Map<string, KrNode[]>()
  for (const k of krRows) {
    // With no cutoff, `current` is left exactly as today's behaviour: the
    // stored summary.
    let current = k.current
    let latestMonth: string | null = null
    let measuredByCutoff = true

    if (asOfMonth) {
      const byMonth = byMonthByKr.get(k.id)
      const periodId = periodIdByObjective.get(k.objectiveId)
      // Months come from the key result's OWN period, so a range covering two
      // periods gives each one its own window. A single shared month list
      // would also work today, but only because `byMonth` is per key result —
      // correct for a reason a later reader should not have to reconstruct.
      const periodMonths = periodId ? periodMonthsOf(periodId) : []
      // The summary bridge, taken when this key result has no monthly row that
      // its own period could ever have produced. Two shapes reach it and both
      // want the stored summary:
      //
      //  - No rows at all: never been through monthly entry, so the summary is
      //    the only figure that exists. Falling through to `start` would read
      //    as "0% progress" for every key result in the company until someone
      //    had entered a year of history by hand — `kr_monthly_values` is
      //    empty in production.
      //  - Rows, but every one of them outside this period's calendar
      //    (orphans). A check-in taken after the fiscal year's last day writes
      //    today's month with no period check (`lib/actions/core/checkins.ts`),
      //    and editing a period's dates leaves rows outside the new window
      //    (`lib/actions/core/periods.ts`) — both produce months this period
      //    can never list. Treating that as "unmeasured" would render `start`
      //    and silently drop the key result out of its objective, department
      //    and company percentages. The stored summary is the right answer
      //    because `recomputeSummary` selects every row for the key result with
      //    no period filter, so the orphaned value is already folded into it:
      //    showing the summary shows the best figure that exists.
      //
      // Rows that ARE inside the period but all fall after the cutoff are a
      // different case and deliberately not this one — see below.
      const measurable = byMonth ? periodMonths.some((m) => byMonth.has(m)) : false
      if (byMonth && measurable) {
        const months = periodMonths.filter((m) => m <= asOfMonth)
        const resolved = valueForRange(k.rollup, months, byMonth, periodMonths)
        // Measured inside the period, but not yet by this cutoff: `k.start`,
        // not 0 — and flagged unmeasured so the averages exclude it rather
        // than count it as 0%.
        current = resolved.value ?? k.start
        measuredByCutoff = resolved.value !== null
        latestMonth = resolved.latestMonth
      }
    }

    const node: KrNode = {
      id: k.id,
      titleTr: k.titleTr,
      titleEn: k.titleEn,
      start: k.start,
      current,
      target: k.target,
      unit: k.unit,
      confidence: k.confidence,
      rollup: k.rollup,
      weight: k.weight,
      ownerUserId: k.ownerUserId,
      ownerName: k.ownerUserId ? (nameById.get(k.ownerUserId) ?? '') : '',
      updatedAt: k.updatedAt,
      latestMonth,
      measuredByCutoff,
      daysSinceUpdate: Math.max(0, Math.floor((now - k.updatedAt.getTime()) / MS_PER_DAY)),
    }
    const list = krsByObjective.get(k.objectiveId)
    if (list) list.push(node)
    else krsByObjective.set(k.objectiveId, [node])
  }

  const objsByDept = new Map<string, ObjNode[]>()
  for (const o of objRows) {
    const node: ObjNode = {
      id: o.id,
      code: o.code,
      titleTr: o.titleTr,
      titleEn: o.titleEn,
      ownerUserId: o.ownerUserId,
      ownerName: o.ownerUserId ? (nameById.get(o.ownerUserId) ?? '') : '',
      departmentId: o.departmentId,
      periodId: o.periodId,
      krs: krsByObjective.get(o.id) ?? [],
    }
    const list = objsByDept.get(o.departmentId)
    if (list) list.push(node)
    else objsByDept.set(o.departmentId, [node])
  }

  const depts: DeptNode[] = deptRows.map((d) => ({
    id: d.id,
    slug: d.slug,
    emoji: d.emoji,
    nameTr: d.nameTr,
    nameEn: d.nameEn,
    leadName: d.leadUserId ? (nameById.get(d.leadUserId) ?? '') : '',
    objectives: objsByDept.get(d.id) ?? [],
  }))

  return { periods, depts }
}

/** Flattens the tree to every key result with its objective and department. */
export function allKrs(depts: DeptNode[]): { dept: DeptNode; obj: ObjNode; kr: KrNode }[] {
  return depts.flatMap((dept) =>
    dept.objectives.flatMap((obj) => obj.krs.map((kr) => ({ dept, obj, kr }))),
  )
}

/**
 * The key results that were measured by the cutoff.
 *
 * The one definition of "measured": `measuredOnly` builds on it, and the
 * department, objective, report and sidebar percentages call it directly
 * because they need the filtered leaves without rebuilding the whole tree.
 * Four copies of `kr.measuredByCutoff` would be four places to forget it.
 */
export function measuredKrsOf(krs: readonly KrNode[]): KrNode[] {
  return krs.filter((kr) => kr.measuredByCutoff)
}

/**
 * The tree with key results that were not measured by the cutoff dropped.
 *
 * A key result with no measurement up to the cutoff reports `start`, which
 * `krPct` reads as 0% — not "no progress" but "no data yet". Averaging it in
 * would drag every figure toward zero as soon as one key result has an
 * unfilled month. Filtering the leaves here keeps this entirely out of
 * `lib/domain/progress.ts`: `isMeasurable` there still means only
 * `target !== start`, the one thing every caller already relies on, and the
 * exclusion still propagates up on its own — `hasMeasurableKr` is false for an
 * objective left with no key results, so `deptPct` and `companyPct` skip it
 * rather than counting a zero.
 *
 * With no cutoff every key result is `measuredByCutoff`, so this is the
 * identity function — callers can apply it unconditionally.
 */
export function measuredOnly(depts: readonly DeptNode[]): DeptNode[] {
  return depts.map((d) => ({
    ...d,
    objectives: d.objectives.map((o) => ({ ...o, krs: measuredKrsOf(o.krs) })),
  }))
}
