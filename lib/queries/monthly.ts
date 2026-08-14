import { can, type SessionUser } from '@/lib/auth/permissions'
import type { Db } from '@/lib/db'
import { todayInIstanbul } from '@/lib/domain/dates'
import { monthsOfPeriod } from '@/lib/domain/monthly'
import type { RollupRule } from '@/lib/domain/types'
import { activePeriodOf } from './range'
import { allDepartments, allKeyResults, allMonthlyValues, allObjectives, allPeriods } from './tables'

/**
 * One key result on the bulk entry screen.
 *
 * `value` is the month's recorded figure, or `null` when nothing has been
 * entered — never `0`. Confusing the two would silently turn every unfilled
 * row into a real measurement of zero and wreck every average downstream.
 */
export interface MonthlyEntryRow {
  krId: string
  titleTr: string
  titleEn: string
  rollup: RollupRule
  target: number
  unit: string
  value: number | null
  /**
   * Whether the signed-in user may write this row. Computed with the same
   * `can()` call the write path re-checks, so a row that renders editable is
   * never one the server would then refuse — and a row that renders
   * read-only still cannot be forced open from the client, because the
   * server re-checks it again on save regardless of what this flag says.
   */
  canEdit: boolean
}

export interface MonthlyEntryDept {
  id: string
  slug: string
  emoji: string
  nameTr: string
  nameEn: string
  rows: MonthlyEntryRow[]
}

export interface MonthlyEntryVm {
  /** The open period's months, chronological. Empty when no period is open. */
  months: string[]
  /** The month the table is showing — `null` exactly when `months` is empty. */
  month: string | null
  depts: MonthlyEntryDept[]
  /** How many editable rows already carry a value for `month`. */
  filledCount: number
  /** Editable rows total — the denominator for `filledCount`. */
  editableCount: number
}

/**
 * The view model for the monthly bulk-entry screen.
 *
 * Every department's key results are included, not just the ones the caller
 * may edit — a user who can edit some key results and not others (a future
 * department-scoped role; today's flat admin/executive split does not
 * produce this mix, but the read shape must not assume it never will) still
 * needs to see the ones they cannot touch, rendered read-only. Hiding a row
 * is not access control either way: the server re-checks permission on every
 * write regardless of what this view model marks.
 *
 * Reads go entirely through `./tables`'s memoised selects — no query of its
 * own — so this adds no statement to the per-request fan-out beyond whichever
 * of those five tables a caller had not already touched.
 */
export async function getMonthlyEntryVm(
  db: Db,
  user: SessionUser,
  month?: string,
  now: Date = new Date(),
): Promise<MonthlyEntryVm> {
  const [periodRows, deptRows, objRows, krRows, monthlyRows] = await Promise.all([
    allPeriods(db),
    allDepartments(db),
    allObjectives(db),
    allKeyResults(db),
    allMonthlyValues(db),
  ])

  const openPeriod = activePeriodOf(
    periodRows.map((p) => ({
      id: p.id,
      code: p.code,
      kind: p.kind,
      state: p.state,
      startsOn: p.startsOn,
      endsOn: p.endsOn,
    })),
  )

  if (!openPeriod) {
    return { months: [], month: null, depts: [], filledCount: 0, editableCount: 0 }
  }

  const months = monthsOfPeriod(openPeriod.startsOn, openPeriod.endsOn)

  // Defaults to the calendar month we are in right now, same as the picker's
  // own fallback — but only when that month actually belongs to the open
  // period. A period that has not reached (or has run past) today's month
  // falls back to the period's last month instead of rendering an empty pick.
  const todayMonth = todayInIstanbul(now).slice(0, 7)
  const fallbackMonth = months.includes(todayMonth) ? todayMonth : (months[months.length - 1] ?? null)
  const selectedMonth = month && months.includes(month) ? month : fallbackMonth

  if (selectedMonth === null) {
    return { months, month: null, depts: [], filledCount: 0, editableCount: 0 }
  }

  const objectivesInPeriod = objRows.filter((o) => o.periodId === openPeriod.id)

  const valueByKr = new Map<string, number>()
  for (const row of monthlyRows) {
    if (row.month === selectedMonth) valueByKr.set(row.keyResultId, row.value)
  }

  const krsByObjective = new Map<string, typeof krRows>()
  for (const kr of krRows) {
    const list = krsByObjective.get(kr.objectiveId)
    if (list) list.push(kr)
    else krsByObjective.set(kr.objectiveId, [kr])
  }

  const rowsByDept = new Map<string, MonthlyEntryRow[]>()
  let filledCount = 0
  let editableCount = 0

  // Iterating objectives (already ordered by code) rather than `krRows`
  // directly keeps a department's rows clustered by the objective they
  // belong to, instead of the arbitrary id order `allKeyResults` returns.
  for (const obj of objectivesInPeriod) {
    for (const kr of krsByObjective.get(obj.id) ?? []) {
      const canEdit = can(user, 'checkin:kr', {
        departmentId: obj.departmentId,
        ownerUserId: kr.ownerUserId,
      })
      const value = valueByKr.get(kr.id) ?? null
      if (canEdit) {
        editableCount++
        if (value !== null) filledCount++
      }

      const row: MonthlyEntryRow = {
        krId: kr.id,
        titleTr: kr.titleTr,
        titleEn: kr.titleEn,
        rollup: kr.rollup,
        target: kr.target,
        unit: kr.unit,
        value,
        canEdit,
      }
      const list = rowsByDept.get(obj.departmentId)
      if (list) list.push(row)
      else rowsByDept.set(obj.departmentId, [row])
    }
  }

  const depts: MonthlyEntryDept[] = deptRows
    .map((d) => ({
      id: d.id,
      slug: d.slug,
      emoji: d.emoji,
      nameTr: d.nameTr,
      nameEn: d.nameEn,
      rows: rowsByDept.get(d.id) ?? [],
    }))
    .filter((d) => d.rows.length > 0)

  return { months, month: selectedMonth, depts, filledCount, editableCount }
}
