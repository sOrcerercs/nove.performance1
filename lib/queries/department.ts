import type { Db } from '@/lib/db'
import { deptPct, krPct, objPct } from '@/lib/domain/progress'
import type { Confidence } from '@/lib/domain/types'
import { loadTree, type DeptNode, type KrNode, type ObjNode } from './tree'

/**
 * View models for the department and objective screens.
 *
 * These are deliberately plain, fully serialisable objects: they cross the
 * server/client boundary as props, so no `Date` instances and no database rows
 * — `updatedAt` is already reduced to `daysSinceUpdate` upstream in `loadTree`.
 * Percentages are computed here, once, so the client never re-derives them.
 */
export interface KrVm {
  /** Needed by the editor's owner picker. */
  ownerUserId: string | null
  id: string
  titleTr: string
  titleEn: string
  start: number
  current: number
  target: number
  unit: string
  confidence: Confidence
  ownerName: string
  pct: number
  daysSinceUpdate: number
}

export interface ObjectiveVm {
  ownerUserId: string | null
  id: string
  code: string
  titleTr: string
  titleEn: string
  ownerName: string
  pct: number
  krs: KrVm[]
}

export interface DeptDetailVm {
  slug: string
  emoji: string
  nameTr: string
  nameEn: string
  leadName: string
  pct: number
  objectives: ObjectiveVm[]
}

export interface ObjectiveDetailVm extends ObjectiveVm {
  /** Needed by the page to decide whether the editor is offered. */
  deptId: string
  deptSlug: string
  deptEmoji: string
  deptNameTr: string
  deptNameEn: string
}

function toKrVm(kr: KrNode): KrVm {
  return {
    id: kr.id,
    ownerUserId: kr.ownerUserId,
    titleTr: kr.titleTr,
    titleEn: kr.titleEn,
    start: kr.start,
    current: kr.current,
    target: kr.target,
    unit: kr.unit,
    confidence: kr.confidence,
    ownerName: kr.ownerName,
    pct: krPct(kr),
    daysSinceUpdate: kr.daysSinceUpdate,
  }
}

function toObjectiveVm(obj: ObjNode): ObjectiveVm {
  return {
    id: obj.id,
    code: obj.code,
    titleTr: obj.titleTr,
    titleEn: obj.titleEn,
    ownerUserId: obj.ownerUserId,
    ownerName: obj.ownerName,
    pct: objPct(obj.krs),
    krs: obj.krs.map(toKrVm),
  }
}

/**
 * One department with its objectives and key results for a period.
 *
 * Built on `loadTree` rather than a targeted query: the whole period is 25 key
 * results, and reusing the loader keeps owner resolution and the
 * "days since update" derivation in exactly one place.
 *
 * Returns `null` for a slug that does not exist so the page can `notFound()`
 * instead of rendering an empty department.
 */
export async function getDepartment(
  db: Db,
  slug: string,
  periodCode: string,
): Promise<DeptDetailVm | null> {
  const { depts } = await loadTree(db, periodCode)
  const dept = depts.find((d) => d.slug === slug)
  if (!dept) return null

  return {
    slug: dept.slug,
    emoji: dept.emoji,
    nameTr: dept.nameTr,
    nameEn: dept.nameEn,
    leadName: dept.leadName,
    pct: deptPct(dept.objectives),
    objectives: dept.objectives.map(toObjectiveVm),
  }
}

/** One objective with the department it belongs to, or `null` for an unknown id. */
export async function getObjective(
  db: Db,
  id: string,
  periodCode: string,
): Promise<ObjectiveDetailVm | null> {
  const { depts } = await loadTree(db, periodCode)

  let found: { dept: DeptNode; obj: ObjNode } | null = null
  for (const dept of depts) {
    const obj = dept.objectives.find((o) => o.id === id)
    if (obj) {
      found = { dept, obj }
      break
    }
  }
  if (!found) return null

  return {
    ...toObjectiveVm(found.obj),
    deptId: found.dept.id,
    deptSlug: found.dept.slug,
    deptEmoji: found.dept.emoji,
    deptNameTr: found.dept.nameTr,
    deptNameEn: found.dept.nameEn,
  }
}
