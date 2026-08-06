import type { Db } from '@/lib/db'
import type { Confidence } from '@/lib/domain/types'
import { allDepartments, allKeyResults, allObjectives, allPeriods, allUsers } from './tables'

export interface KrNode {
  id: string
  titleTr: string
  titleEn: string
  start: number
  current: number
  target: number
  unit: string
  confidence: Confidence
  ownerUserId: string | null
  ownerName: string
  updatedAt: Date
  /** Whole days since the last update — the prototype's "updated N days ago". */
  daysSinceUpdate: number
}

export interface ObjNode {
  id: string
  code: string
  titleTr: string
  titleEn: string
  ownerUserId: string | null
  ownerName: string
  departmentId: string
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
 * Loads the whole OKR tree for one period.
 *
 * Deliberately flat reads assembled in memory rather than a join or SQL
 * aggregation: the dataset is 25 key results, and keeping the shaping in
 * TypeScript means progress is computed in exactly one place (`lib/domain`)
 * instead of being duplicated in SQL. The reads go through `./tables`, so the
 * layout and the page share them instead of each paying for its own copy.
 */
export async function loadTree(
  db: Db,
  periodCode: string,
): Promise<{ period: PeriodInfo | null; depts: DeptNode[] }> {
  const [periodRows, deptRows, userRows, allObjRows, krRows] = await Promise.all([
    allPeriods(db),
    allDepartments(db),
    allUsers(db),
    allObjectives(db),
    allKeyResults(db),
  ])

  const period = periodRows.find((p) => p.code === periodCode)
  if (!period) return { period: null, depts: [] }

  const objRows = allObjRows.filter((o) => o.periodId === period.id)
  const nameById = new Map(userRows.map((u) => [u.id, u.name]))
  const now = Date.now()

  const krsByObjective = new Map<string, KrNode[]>()
  for (const k of krRows) {
    const node: KrNode = {
      id: k.id,
      titleTr: k.titleTr,
      titleEn: k.titleEn,
      start: k.start,
      current: k.current,
      target: k.target,
      unit: k.unit,
      confidence: k.confidence,
      ownerUserId: k.ownerUserId,
      ownerName: k.ownerUserId ? (nameById.get(k.ownerUserId) ?? '') : '',
      updatedAt: k.updatedAt,
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

  return { period: { id: period.id, code: period.code }, depts }
}

/** Flattens the tree to every key result with its objective and department. */
export function allKrs(depts: DeptNode[]): { dept: DeptNode; obj: ObjNode; kr: KrNode }[] {
  return depts.flatMap((dept) =>
    dept.objectives.flatMap((obj) => obj.krs.map((kr) => ({ dept, obj, kr }))),
  )
}
