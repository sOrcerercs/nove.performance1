import type { Db } from '@/lib/db'
import { deptPct } from '@/lib/domain/progress'
import { allDepartments, allKeyResults, allObjectives, allPeriods } from './tables'

export interface SidebarDeptInfo {
  slug: string
  emoji: string
  nameTr: string
  nameEn: string
}

export interface SidebarData {
  depts: SidebarDeptInfo[]
  /** periodCode → { deptSlug → progress }. Missing entries mean 0%. */
  pctByPeriod: Record<string, Record<string, number>>
}

/**
 * Department progress for *every* period at once.
 *
 * Next does not pass `searchParams` to layouts, so the sidebar cannot know
 * which period the page is showing. Rather than let it disagree with the
 * content, it receives every period's numbers and the client picks by URL.
 * The whole dataset is a few dozen rows, so this is four flat reads, not one
 * query per period — and they are the same reads the page itself needs, so
 * `./tables` serves both from one roundtrip each.
 */
export async function getSidebarData(db: Db): Promise<SidebarData> {
  const [deptRows, periodRows, objRows, krRows] = await Promise.all([
    allDepartments(db),
    allPeriods(db),
    allObjectives(db),
    allKeyResults(db),
  ])

  const krsByObjective = new Map<string, { start: number; current: number; target: number }[]>()
  for (const k of krRows) {
    const list = krsByObjective.get(k.objectiveId)
    const kr = { start: k.start, current: k.current, target: k.target }
    if (list) list.push(kr)
    else krsByObjective.set(k.objectiveId, [kr])
  }

  const codeByPeriodId = new Map(periodRows.map((p) => [p.id, p.code]))

  // periodCode → deptId → objectives
  const grouped = new Map<string, Map<string, { krs: { start: number; current: number; target: number }[] }[]>>()
  for (const o of objRows) {
    const code = codeByPeriodId.get(o.periodId)
    if (!code) continue
    let byDept = grouped.get(code)
    if (!byDept) {
      byDept = new Map()
      grouped.set(code, byDept)
    }
    const entry = { krs: krsByObjective.get(o.id) ?? [] }
    const list = byDept.get(o.departmentId)
    if (list) list.push(entry)
    else byDept.set(o.departmentId, [entry])
  }

  const pctByPeriod: Record<string, Record<string, number>> = {}
  for (const p of periodRows) {
    const byDept = grouped.get(p.code)
    const row: Record<string, number> = {}
    for (const d of deptRows) {
      row[d.slug] = byDept ? deptPct(byDept.get(d.id) ?? []) : 0
    }
    pctByPeriod[p.code] = row
  }

  return {
    depts: deptRows.map((d) => ({
      slug: d.slug,
      emoji: d.emoji,
      nameTr: d.nameTr,
      nameEn: d.nameEn,
    })),
    pctByPeriod,
  }
}
