import type { Db } from '@/lib/db'
import { deptPct } from '@/lib/domain/progress'
import { allDepartments } from './tables'
import { loadTree, measuredKrsOf } from './tree'

export interface SidebarDeptInfo {
  slug: string
  emoji: string
  nameTr: string
  nameEn: string
}

export interface SidebarData {
  depts: SidebarDeptInfo[]
  /** deptSlug → the department's percentage for the range the layout resolved. */
  pctBySlug: Record<string, number>
}

/** The four fields the nav needs, off either `loadTree`'s `DeptNode` or the
 *  raw `departments` row — written once so the two branches below cannot
 *  drift out of sync with each other. */
const toInfo = (d: { slug: string; emoji: string; nameTr: string; nameEn: string }): SidebarDeptInfo => ({
  slug: d.slug,
  emoji: d.emoji,
  nameTr: d.nameTr,
  nameEn: d.nameEn,
})

/**
 * The sidebar's department list and percentages.
 *
 * Computed from the same `loadTree` call the page makes, for the same range —
 * the layout learns the range from the `x-search-params` header the middleware
 * sets. Before that header existed the layout could not see the query string,
 * so it shipped every period's raw totals and the client merged the covered
 * ones; that trick cannot survive month resolution, because `sum`/`avg`/`last`
 * do not decompose per month and pre-averaged figures cannot be recombined.
 */
export async function getSidebarData(
  db: Db,
  periodIds: readonly string[],
  asOf?: string,
): Promise<SidebarData> {
  const { depts } = await loadTree(db, periodIds, asOf)

  // `loadTree` returns no departments at all when the range covers no period.
  // The nav must still list them — a department the sidebar drops is one nobody
  // can click to — so the list falls back to the table and every figure is 0,
  // the same shape `getDepartmentForPage`'s `empty-range` branch renders.
  if (depts.length === 0) {
    const rows = await allDepartments(db)
    return {
      depts: rows.map(toInfo),
      pctBySlug: Object.fromEntries(rows.map((d) => [d.slug, 0])),
    }
  }

  const pctBySlug: Record<string, number> = {}
  for (const d of depts) {
    pctBySlug[d.slug] = deptPct(d.objectives.map((o) => ({ krs: measuredKrsOf(o.krs) })))
  }

  return {
    depts: depts.map(toInfo),
    pctBySlug,
  }
}
