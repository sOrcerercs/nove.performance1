import type { Db } from '@/lib/db'
import { companyPct, deptPct, krPct } from '@/lib/domain/progress'
import { isOpenToDevelopment, statusOf } from '@/lib/domain/status'
import type { Confidence, StatusKey } from '@/lib/domain/types'
import { allKrs, loadTree } from './tree'

/** One department tile on the overview grid / ranking list. */
export interface OverviewDept {
  slug: string
  emoji: string
  nameTr: string
  nameEn: string
  leadName: string
  pct: number
  objectiveCount: number
  krCount: number
}

/** A key result that needs intervention — the "Dikkat" list. */
export interface OverviewAttentionItem {
  krId: string
  titleTr: string
  titleEn: string
  deptSlug: string
  deptEmoji: string
  ownerName: string
  pct: number
  current: number
  target: number
  unit: string
  confidence: Confidence
  daysSinceUpdate: number
}

/**
 * One elapsed month of the company trend.
 *
 * `month` is the two-digit month number rather than a name: the view model is
 * built on the server, which has no access to the user's language preference
 * (it lives in localStorage), so the chart localises the label itself.
 */
export interface OverviewTrendPoint {
  month: string
  actual: number
  pace: number
}

export interface OverviewDistributionSlice {
  status: StatusKey
  count: number
}

export interface OverviewVm {
  companyPct: number
  kpis: { depts: number; objectives: number; krs: number; avgPct: number; openKrs: number }
  depts: OverviewDept[]
  attention: OverviewAttentionItem[]
  trend: OverviewTrendPoint[]
  distribution: OverviewDistributionSlice[]
}

/**
 * The twelve-month axis the trend chart is drawn against. The company target
 * pace is a straight line from 0% in January to 100% in December, so month `i`
 * is expected to sit at `i / (MONTHS_IN_YEAR - 1)` of the way there.
 */
export const MONTHS_IN_YEAR = 12

/**
 * Progress for the elapsed months of the year, ported verbatim from the
 * prototype's `trendChart()`. The prototype had no monthly history table, so it
 * synthesised a ramp and pinned the final point to the live company average;
 * this reproduces that ramp exactly rather than inventing a different one. When
 * a real history table lands, only this constant and `buildTrend` change.
 */
const SYNTHESISED_RAMP = [6, 13, 22, 29, 37, 44] as const

/** Every status bucket, in the prototype's legend order. Empty buckets stay in
 *  the list so the legend does not reflow as key results move between them. */
const STATUS_ORDER: readonly StatusKey[] = ['above', 'expected', 'below', 'open', 'none']

function buildTrend(currentPct: number): OverviewTrendPoint[] {
  const actuals = [...SYNTHESISED_RAMP, currentPct]
  return actuals.map((actual, i) => ({
    month: String(i + 1).padStart(2, '0'),
    actual,
    pace: Math.round((i * 100) / (MONTHS_IN_YEAR - 1)),
  }))
}

/**
 * Everything the performance overview screen renders, as plain serialisable
 * data.
 *
 * The screen is a client component (the layout variant is a client preference),
 * so this crosses the server/client boundary: no `Date`s, no class instances,
 * numbers and strings only. Percentages are computed here once, on the server,
 * so the client never re-derives them and cannot drift from the report screen.
 */
export async function getOverview(db: Db, periodCode: string): Promise<OverviewVm> {
  const { depts } = await loadTree(db, periodCode)
  const flat = allKrs(depts)

  const overall = companyPct(depts)

  const deptVms: OverviewDept[] = depts.map((d) => ({
    slug: d.slug,
    emoji: d.emoji,
    nameTr: d.nameTr,
    nameEn: d.nameEn,
    leadName: d.leadName,
    pct: deptPct(d.objectives),
    objectiveCount: d.objectives.length,
    krCount: d.objectives.reduce((sum, o) => sum + o.krs.length, 0),
  }))

  const attention: OverviewAttentionItem[] = flat
    .map(({ dept, kr }) => ({ dept, kr, pct: krPct(kr) }))
    .filter(({ pct }) => isOpenToDevelopment(pct))
    // Worst first: the point of the list is where to intervene next.
    .sort((a, b) => a.pct - b.pct || a.kr.id.localeCompare(b.kr.id))
    .map(({ dept, kr, pct }) => ({
      krId: kr.id,
      titleTr: kr.titleTr,
      titleEn: kr.titleEn,
      deptSlug: dept.slug,
      deptEmoji: dept.emoji,
      ownerName: kr.ownerName,
      pct,
      current: kr.current,
      target: kr.target,
      unit: kr.unit,
      confidence: kr.confidence,
      daysSinceUpdate: kr.daysSinceUpdate,
    }))

  const counts = new Map<StatusKey, number>(STATUS_ORDER.map((k) => [k, 0]))
  for (const { kr } of flat) {
    const key = statusOf(krPct(kr))
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return {
    companyPct: overall,
    kpis: {
      depts: depts.length,
      objectives: depts.reduce((sum, d) => sum + d.objectives.length, 0),
      krs: flat.length,
      avgPct: overall,
      openKrs: attention.length,
    },
    depts: deptVms,
    attention,
    trend: buildTrend(overall),
    distribution: STATUS_ORDER.map((status) => ({ status, count: counts.get(status) ?? 0 })),
  }
}
