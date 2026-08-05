import type { Db } from '@/lib/db'
import { companyPct, deptPct, krPct } from '@/lib/domain/progress'
import { isOpenToDevelopment } from '@/lib/domain/status'
import type { Confidence, Lang } from '@/lib/domain/types'
import { allKrs, loadTree } from './tree'

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
  /** Null when the requested period does not exist. */
  periodCode: string | null
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
export async function getReport(db: Db, periodCode: string): Promise<ReportVm> {
  const { period, depts } = await loadTree(db, periodCode)

  const rows: ReportRow[] = depts.map((d) => {
    const krs = d.objectives.flatMap((o) => o.krs)
    return {
      slug: d.slug,
      emoji: d.emoji,
      nameTr: d.nameTr,
      nameEn: d.nameEn,
      leadName: d.leadName,
      objectives: d.objectives.length,
      krs: krs.length,
      openKrs: krs.filter((kr) => isOpenToDevelopment(krPct(kr))).length,
      pct: deptPct(d.objectives),
    }
  })

  const openToDev: ReportOpenKr[] = allKrs(depts)
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
    periodCode: period?.code ?? null,
    rows,
    openToDev,
    totals: {
      objectives: rows.reduce((n, r) => n + r.objectives, 0),
      krs: rows.reduce((n, r) => n + r.krs, 0),
      openKrs: openToDev.length,
      companyPct: companyPct(depts),
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
