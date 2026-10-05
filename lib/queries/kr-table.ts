import { asc, eq, inArray } from 'drizzle-orm'
import type { Db } from '@/lib/db'
import { departments, keyResults, krMonthlyValues, objectives, periods } from '@/lib/db/schema'
import { monthsOfPeriod } from '@/lib/domain/monthly'
import { buildMonthlyTable, type MonthlyRow } from '@/lib/domain/monthly-table'
import type { RollupRule } from '@/lib/domain/types'

/**
 * View model for the Key Results screen under Yönetim: every key result of the
 * selected periods, grouped by department, plus the monthly table of the one
 * being looked at. Read-only — values are entered on Veri Girişi.
 */

export interface KrTableListItem {
  id: string
  titleTr: string
  titleEn: string
  objectiveCode: string
  periodCode: string
  weight: number | null
}

export interface KrTableDept {
  slug: string
  emoji: string
  nameTr: string
  nameEn: string
  krs: KrTableListItem[]
}

export interface KrTableSelected extends KrTableListItem {
  deptSlug: string
  deptEmoji: string
  deptNameTr: string
  deptNameEn: string
  objectiveTitleTr: string
  objectiveTitleEn: string
  unit: string
  start: number
  target: number
  current: number
  rule: RollupRule
  rows: MonthlyRow[]
}

export interface KrTableVm {
  depts: KrTableDept[]
  /** Null only when the selected periods hold no key results at all. */
  selected: KrTableSelected | null
}

export async function getKrTableVm(
  db: Db,
  periodIds: readonly string[],
  selectedKrId?: string,
): Promise<KrTableVm> {
  if (periodIds.length === 0) return { depts: [], selected: null }

  const krs = await db
    .select({
      id: keyResults.id,
      titleTr: keyResults.titleTr,
      titleEn: keyResults.titleEn,
      unit: keyResults.unit,
      start: keyResults.start,
      target: keyResults.target,
      current: keyResults.current,
      rule: keyResults.rollup,
      weight: keyResults.weight,
      objectiveCode: objectives.code,
      objectiveTitleTr: objectives.titleTr,
      objectiveTitleEn: objectives.titleEn,
      periodCode: periods.code,
      startsOn: periods.startsOn,
      endsOn: periods.endsOn,
      deptSlug: departments.slug,
      deptEmoji: departments.emoji,
      deptNameTr: departments.nameTr,
      deptNameEn: departments.nameEn,
    })
    .from(keyResults)
    .innerJoin(objectives, eq(keyResults.objectiveId, objectives.id))
    .innerJoin(departments, eq(objectives.departmentId, departments.id))
    .innerJoin(periods, eq(objectives.periodId, periods.id))
    .where(inArray(objectives.periodId, [...periodIds]))
    .orderBy(asc(departments.sortOrder), asc(periods.startsOn), asc(objectives.code), asc(keyResults.titleTr))

  const depts: KrTableDept[] = []
  for (const k of krs) {
    let dept = depts.at(-1)
    if (!dept || dept.slug !== k.deptSlug) {
      dept = { slug: k.deptSlug, emoji: k.deptEmoji, nameTr: k.deptNameTr, nameEn: k.deptNameEn, krs: [] }
      depts.push(dept)
    }
    dept.krs.push({
      id: k.id,
      titleTr: k.titleTr,
      titleEn: k.titleEn,
      objectiveCode: k.objectiveCode,
      periodCode: k.periodCode,
      weight: k.weight,
    })
  }

  // An unknown or out-of-range id (an old link, another period) falls back to
  // the first key result rather than an empty screen.
  const pick = krs.find((k) => k.id === selectedKrId) ?? krs[0]
  if (!pick) return { depts, selected: null }

  const values = await db
    .select({ month: krMonthlyValues.month, value: krMonthlyValues.value, note: krMonthlyValues.note })
    .from(krMonthlyValues)
    .where(eq(krMonthlyValues.keyResultId, pick.id))

  const { startsOn, endsOn, ...kr } = pick
  return {
    depts,
    selected: {
      ...kr,
      rows: buildMonthlyTable({
        months: monthsOfPeriod(startsOn, endsOn),
        rule: kr.rule,
        start: kr.start,
        target: kr.target,
        values,
      }),
    },
  }
}
