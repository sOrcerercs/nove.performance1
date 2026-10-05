import type { Db } from '@/lib/db'
import { deptPct, krPct, objPct } from '@/lib/domain/progress'
import type { Confidence, RollupRule } from '@/lib/domain/types'
import { allDepartments, allUsers } from './tables'
import { loadTree, measuredKrsOf, type DeptNode, type KrNode, type ObjNode } from './tree'

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
  /** Needed by the editor's per-key-result rollup selector. */
  rollup: RollupRule
  /** Percent share inside the objective; null = unweighted. */
  weight: number | null
  ownerName: string
  pct: number
  daysSinceUpdate: number
  latestMonth: string | null
  /**
   * Whether `current` is a real measurement or the no-data-by-the-cutoff
   * fallback to `start` (see `KrNode.measuredByCutoff`).
   *
   * Carried through to the row rather than dropped here, because an unmeasured
   * key result is otherwise indistinguishable on screen from one genuinely
   * sitting at its start — same `current`, same 0% bar, and no "son veri"
   * marker either, since `latestMonth` is `null` in exactly this case. Meanwhile
   * it is excluded from the objective's percentage, so an objective can read
   * 100% above two bars showing 100% and 0%. The row needs this to say why.
   */
  measuredByCutoff: boolean
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
  /** The objective's own period — shown in the header, independent of the filter. */
  periodCode: string
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
    rollup: kr.rollup,
    weight: kr.weight,
    ownerName: kr.ownerName,
    pct: krPct(kr),
    daysSinceUpdate: kr.daysSinceUpdate,
    latestMonth: kr.latestMonth,
    measuredByCutoff: kr.measuredByCutoff,
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
    // The percentage covers the measured key results; the rows listed are all
    // of them, so a key result with no data by the cutoff is still visible but
    // does not move the number.
    pct: objPct(measuredKrsOf(obj.krs)),
    krs: obj.krs.map(toKrVm),
  }
}

/**
 * One department with its objectives and key results for a period.
 *
 * Built on `loadTree` rather than a targeted query: the whole period is 63 key
 * results, and reusing the loader keeps owner resolution and the
 * "days since update" derivation in exactly one place.
 *
 * Returns `null` for a slug that does not exist so the page can `notFound()`
 * instead of rendering an empty department.
 */
export async function getDepartment(
  db: Db,
  slug: string,
  periodIds: readonly string[],
  asOf?: string,
): Promise<DeptDetailVm | null> {
  const { depts } = await loadTree(db, periodIds, asOf)
  const dept = depts.find((d) => d.slug === slug)
  if (!dept) return null

  return {
    slug: dept.slug,
    emoji: dept.emoji,
    nameTr: dept.nameTr,
    nameEn: dept.nameEn,
    leadName: dept.leadName,
    // Filtering at the leaf makes `measuredOnly` unnecessary on this path:
    // `deptPct` already excludes an objective left with no measured key
    // results (`hasMeasurableKr`); the predicate still comes from the one
    // definition, `measuredKrsOf`.
    pct: deptPct(dept.objectives.map((o) => ({ krs: measuredKrsOf(o.krs) }))),
    objectives: dept.objectives.map(toObjectiveVm),
  }
}

/**
 * Which outcome the department page renders.
 *
 * `not-found` is a genuinely unknown slug. `empty-range` is a real department
 * whose current date-range filter happens to match zero periods — the page
 * must render this screen's own empty state for that, not 404, or a
 * department the sidebar is still listing becomes unreachable by one click.
 */
export type DepartmentPageResult =
  | { kind: 'ok'; dept: DeptDetailVm }
  | { kind: 'empty-range'; dept: DeptDetailVm }
  | { kind: 'not-found' }

/**
 * Resolves a department for its page, distinguishing "the range covers no
 * periods" from "this slug does not exist" — a distinction `getDepartment`
 * cannot make on its own, because `loadTree` short-circuits to no departments
 * at all when `periodIds` is empty, so a real slug and a fake one both come
 * back `null` from it.
 *
 * When `periodIds` is empty this looks the department up directly off
 * `allDepartments`/`allUsers` (both already part of the per-request memo, so
 * this costs no extra roundtrip) rather than through `loadTree`, and reports
 * it with zero objectives — the same shape the screen already renders for a
 * department that simply has no objectives yet.
 */
export async function getDepartmentForPage(
  db: Db,
  slug: string,
  periodIds: readonly string[],
  asOf?: string,
): Promise<DepartmentPageResult> {
  if (periodIds.length === 0) {
    const [deptRows, userRows] = await Promise.all([allDepartments(db), allUsers(db)])
    const dept = deptRows.find((d) => d.slug === slug)
    if (!dept) return { kind: 'not-found' }

    const nameById = new Map(userRows.map((u) => [u.id, u.name]))
    return {
      kind: 'empty-range',
      dept: {
        slug: dept.slug,
        emoji: dept.emoji,
        nameTr: dept.nameTr,
        nameEn: dept.nameEn,
        leadName: dept.leadUserId ? (nameById.get(dept.leadUserId) ?? '') : '',
        pct: deptPct([]),
        objectives: [],
      },
    }
  }

  const dept = await getDepartment(db, slug, periodIds, asOf)
  return dept ? { kind: 'ok', dept } : { kind: 'not-found' }
}

/** One objective with the department it belongs to, or `null` for an unknown id. */
export async function getObjective(
  db: Db,
  id: string,
  periodIds: readonly string[],
  asOf?: string,
): Promise<ObjectiveDetailVm | null> {
  const { periods, depts } = await loadTree(db, periodIds, asOf)

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
    periodCode: periods.find((p) => p.id === found.obj.periodId)?.code ?? '',
  }
}
