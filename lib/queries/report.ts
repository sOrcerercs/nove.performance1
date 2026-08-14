import type { Db } from '@/lib/db'
import { companyPct, deptPct, isMeasurable, krPct } from '@/lib/domain/progress'
import { isOpenToDevelopment } from '@/lib/domain/status'
import type { Confidence, Lang } from '@/lib/domain/types'
import { allKrs, loadTree, measuredKrsOf, measuredOnly } from './tree'

/** One department line in the executive report's breakdown table. */
export interface ReportRow {
  slug: string
  emoji: string
  nameTr: string
  nameEn: string
  leadName: string
  /** Number of objectives in the period, not their progress. */
  objectives: number
  krs: number
  openKrs: number
  pct: number
}

/** A key result in the "Gelişime Açık" band, flattened out of the tree. */
export interface ReportOpenKr {
  id: string
  deptSlug: string
  deptEmoji: string
  titleTr: string
  titleEn: string
  ownerName: string
  pct: number
  current: number
  target: number
  unit: string
  confidence: Confidence
  daysSinceUpdate: number
}

export interface ReportTotals {
  objectives: number
  krs: number
  openKrs: number
  companyPct: number
}

export interface ReportVm {
  /** Codes of the periods the range covers, oldest first. Empty when none. */
  periodCodes: string[]
  rows: ReportRow[]
  openToDev: ReportOpenKr[]
  totals: ReportTotals
}

/**
 * The executive report's view-model.
 *
 * Everything here is a plain JSON value — no Date, no Drizzle row — because the
 * sortable table is a client component and the whole object crosses the
 * server/client boundary.
 */
export async function getReport(
  db: Db,
  periodIds: readonly string[],
  asOf?: string,
): Promise<ReportVm> {
  const { periods, depts } = await loadTree(db, periodIds, asOf)
  // The company-wide "Gelişime Açık" band and the headline percentage below
  // must read the same measured subset every row above them already does —
  // otherwise `totals.openKrs` (built from `openToDev`) would not equal the
  // sum of `rows[].openKrs`, and the report's own headline would diverge from
  // the overview's `companyPct`, which already runs through `measuredOnly`.
  const measured = measuredOnly(depts)

  const rows: ReportRow[] = depts.map((d) => {
    const krs = d.objectives.flatMap((o) => o.krs)
    // Feeds both `openKrs` and `pct` below — the row still *lists* every key
    // result (`krs.length`, just above, is deliberately unfiltered), but a key
    // result with no measurement by the cutoff must not move either number.
    const measuredObjectives = d.objectives.map((o) => ({ krs: measuredKrsOf(o.krs) }))
    return {
      slug: d.slug,
      emoji: d.emoji,
      nameTr: d.nameTr,
      nameEn: d.nameEn,
      leadName: d.leadName,
      objectives: d.objectives.length,
      krs: krs.length,
      // Unmeasurable key results (start === target) are excluded here for the
      // same reason they are excluded from every average: krPct reports them
      // as a flat 0%, which would otherwise rank them worst-first even though
      // the row is elsewhere badged "Ölçülemiyor" and cannot be measured at
      // all. A key result the cutoff has not reached yet is excluded for the
      // same reason: it too reports the identical flat 0% (via `start`,
      // `loadTree`'s no-data fallback), and would rank worst-first even
      // though nobody has entered a figure for it yet — see `measuredObjectives`.
      openKrs: measuredObjectives
        .flatMap((o) => o.krs)
        .filter((kr) => isMeasurable(kr) && isOpenToDevelopment(krPct(kr))).length,
      pct: deptPct(measuredObjectives),
    }
  })

  const openToDev: ReportOpenKr[] = allKrs(measured)
    .filter(({ kr }) => isMeasurable(kr))
    .map(({ dept, kr }) => ({ dept, kr, pct: krPct(kr) }))
    .filter(({ pct }) => isOpenToDevelopment(pct))
    // Worst first; the id keeps the order stable when two key results tie.
    .sort((a, b) => a.pct - b.pct || a.kr.id.localeCompare(b.kr.id))
    .map(({ dept, kr, pct }) => ({
      id: kr.id,
      deptSlug: dept.slug,
      deptEmoji: dept.emoji,
      titleTr: kr.titleTr,
      titleEn: kr.titleEn,
      ownerName: kr.ownerName,
      pct,
      current: kr.current,
      target: kr.target,
      unit: kr.unit,
      confidence: kr.confidence,
      daysSinceUpdate: kr.daysSinceUpdate,
    }))

  return {
    periodCodes: periods.map((p) => p.code),
    rows,
    openToDev,
    totals: {
      objectives: rows.reduce((n, r) => n + r.objectives, 0),
      krs: rows.reduce((n, r) => n + r.krs, 0),
      openKrs: openToDev.length,
      companyPct: companyPct(measured),
    },
  }
}

export type ReportSortKey = 'name' | 'objectives' | 'krs' | 'openToDev' | 'pct' | 'status'
export type SortDirection = 'asc' | 'desc'

const LOCALE: Record<Lang, string> = { tr: 'tr-TR', en: 'en-US' }

/**
 * Sorting lives here rather than inside the table component so it can be unit
 * tested without rendering React. `status` is derived from `pct`, so it sorts
 * on the same number.
 */
export function sortReportRows(
  rows: readonly ReportRow[],
  key: ReportSortKey,
  direction: SortDirection,
  lang: Lang = 'tr',
): ReportRow[] {
  const sign = direction === 'desc' ? -1 : 1

  const numeric = (r: ReportRow): number => {
    switch (key) {
      case 'objectives':
        return r.objectives
      case 'krs':
        return r.krs
      case 'openToDev':
        return r.openKrs
      default:
        return r.pct
    }
  }

  return [...rows].sort((a, b) => {
    if (key === 'name') {
      const nameA = lang === 'en' ? a.nameEn : a.nameTr
      const nameB = lang === 'en' ? b.nameEn : b.nameTr
      return sign * nameA.localeCompare(nameB, LOCALE[lang])
    }
    // Ties fall back to the department name so the order never jitters.
    const cmp = numeric(a) - numeric(b)
    if (cmp !== 0) return sign * cmp
    return a.slug.localeCompare(b.slug)
  })
}
