import type { Db } from '@/lib/db'
import { todayInIstanbul } from '@/lib/domain/dates'
import { monthsOfPeriod } from '@/lib/domain/monthly'
import { companyPct, deptPct, isMeasurable, krPct } from '@/lib/domain/progress'
import { isOpenToDevelopment, statusOf } from '@/lib/domain/status'
import type { Confidence, StatusKey } from '@/lib/domain/types'
import { allMonthlyValues, allPeriods } from './tables'
import { allKrs, loadTree, measuredOnly } from './tree'

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
  latestMonth: string | null
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
  kpis: {
    depts: number
    objectives: number
    krs: number
    /** How many of `krs` actually had a measurement by the cutoff. Equals `krs`
     *  when no cutoff is given, so the screen can hide the counter then. */
    measuredKrs: number
    avgPct: number
    openKrs: number
  }
  depts: OverviewDept[]
  attention: OverviewAttentionItem[]
  trend: OverviewTrendPoint[]
  distribution: OverviewDistributionSlice[]
  /** Codes of the periods the range covers, oldest first. Empty when none. */
  periodCodes: string[]
}

/**
 * The twelve-month axis the trend chart is drawn against. The company target
 * pace is a straight line from 0% in January to 100% in December, so month `i`
 * is expected to sit at `i / (MONTHS_IN_YEAR - 1)` of the way there.
 */
export const MONTHS_IN_YEAR = 12

/** Every status bucket, in the prototype's legend order. Empty buckets stay in
 *  the list so the legend does not reflow as key results move between them. */
const STATUS_ORDER: readonly StatusKey[] = ['above', 'expected', 'below', 'open', 'none']

/**
 * The company trend, one point per calendar month that has at least one
 * monthly value on file, oldest first.
 *
 * A point's `actual` is deliberately not that month's isolated figure — it is
 * the company percentage computed from every filled month from the earliest
 * selected period through that month, run through the same `krPct` →
 * `objPct` → `deptPct` → `companyPct` chain every other screen uses (via
 * `loadTree`'s cutoff resolution, which is what `lib/domain/monthly.ts`'s
 * `valueForRange` actually applies per key result's rollup rule). For a `sum`
 * key result that makes each point a running total, which is what lets the
 * line read as a trend; for `avg` it is a trailing average over the months
 * measured so far; for `last` it is "the most recent measurement as of that
 * month". Recomputing any of that by hand here, instead of asking
 * `loadTree`/`progress.ts` again for each month, would be exactly the second
 * place percentage logic the project's rule against duplicating it exists to
 * prevent. Each point also runs the tree through `measuredOnly` before handing
 * it to `companyPct`, for the same reason every other cutoff-aware caller
 * does: a key result unmeasured by that point's cutoff must not drag the
 * point toward zero (see `measuredOnly`'s doc block for why).
 *
 * A month with no entry anywhere in the selected periods gets no point at
 * all, rather than a fabricated 0% sitting next to real values — a zero
 * drawn beside real measurements would read as a collapse that never
 * happened. That is also why gapped months (data in September and November,
 * nothing in October) produce two points with a gap between them, not three
 * with a false one in the middle.
 *
 * Months after `now` are excluded even when a period's own calendar extends
 * past today (a fiscal year already has all twelve months on the books),
 * since nothing could have been measured there yet. `now` is a parameter,
 * not `new Date()`, so this stays deterministic in tests — same reason
 * `getOverview` takes it.
 *
 * Months after `asOf` are excluded too, for a mid-period cutoff the same
 * reasoning as `now` applies to: the trend is part of the snapshot, not
 * context sitting behind it, so "as of March" must not plot an August point
 * even though August has already happened by today's clock.
 *
 * The result is built by walking the selected periods' own months in
 * chronological order and filtering, so it is guaranteed sorted before it
 * ever reaches `TrendChart` — which positions each point by its own `month`
 * rather than by array index, but still assumes the array arrives in month
 * order (see that component's docs for why that assumption used to be
 * unguarded and is now load-bearing here instead).
 */
async function buildTrend(
  db: Db,
  periodIds: readonly string[],
  krIds: ReadonlySet<string>,
  now: Date,
  asOf?: string,
): Promise<OverviewTrendPoint[]> {
  const periodRows = await allPeriods(db)
  const selectedPeriods = periodRows.filter((p) => periodIds.includes(p.id))
  if (selectedPeriods.length === 0) return []

  // "Today" as the user experiences it (see `todayInIstanbul`), not the
  // server's UTC clock.
  const todayMonth = todayInIstanbul(now).slice(0, 7)
  // "As of March" must not draw an August point: the trend is part of the
  // snapshot, not context behind it. `todayMonth` still bounds it too — nothing
  // could have been measured in a month that has not happened.
  const cutoffMonth = asOf ? asOf.slice(0, 7) : todayMonth
  const limit = cutoffMonth < todayMonth ? cutoffMonth : todayMonth
  const fullMonths = [
    ...new Set(selectedPeriods.flatMap((p) => monthsOfPeriod(p.startsOn, p.endsOn))),
  ]
    .filter((m) => m <= limit)
    .sort()
  if (fullMonths.length === 0) return []

  const monthlyRows = await allMonthlyValues(db)
  const monthsWithData = new Set(
    monthlyRows.filter((r) => krIds.has(r.keyResultId)).map((r) => r.month),
  )
  const dataMonths = fullMonths.filter((m) => monthsWithData.has(m))

  const points: OverviewTrendPoint[] = []
  for (const month of dataMonths) {
    // The cutoff is this point's own month; `loadTree` truncates to the month,
    // so the day is immaterial.
    const { depts } = await loadTree(db, periodIds, `${month}-01`)
    const monthIndex = Number(month.slice(5, 7)) - 1
    points.push({
      month: month.slice(5, 7),
      actual: companyPct(measuredOnly(depts)),
      pace: Math.round((monthIndex * 100) / (MONTHS_IN_YEAR - 1)),
    })
  }
  return points
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
export async function getOverview(
  db: Db,
  periodIds: readonly string[],
  now: Date = new Date(),
  asOf?: string,
): Promise<OverviewVm> {
  const { periods, depts } = await loadTree(db, periodIds, asOf)
  // Structure (how many objectives, how many key results) comes from the whole
  // tree; every *percentage* comes from the measured subset, so the headline
  // matches the trend and an unfilled month cannot read as a collapse.
  const measured = measuredOnly(depts)

  const flat = allKrs(depts)
  const measuredFlat = allKrs(measured)
  // A key result whose start equals its target is "unmeasurable": krPct
  // reports it as a flat 0% by definition, which is not "no progress", it is
  // "no target". Counting it would rank it worst-first in the attention list
  // and bucket it into "Başlamadı" in the donut — both wrong for a row the UI
  // elsewhere badges "Ölçülemiyor" and excludes from every average.
  const measurable = measuredFlat.filter(({ kr }) => isMeasurable(kr))

  const overall = companyPct(measured)

  // `measured` is `measuredOnly(depts).map(...)` under the hood — a `map`, not
  // a `filter` — so it is always the same length as `depts` and index-aligned
  // with it. No lookup by slug needed.
  const deptVms: OverviewDept[] = depts.map((d, i) => ({
    slug: d.slug,
    emoji: d.emoji,
    nameTr: d.nameTr,
    nameEn: d.nameEn,
    leadName: d.leadName,
    pct: deptPct(measured[i]!.objectives),
    objectiveCount: d.objectives.length,
    krCount: d.objectives.reduce((sum, o) => sum + o.krs.length, 0),
  }))

  const attention: OverviewAttentionItem[] = measurable
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
      latestMonth: kr.latestMonth,
    }))

  const counts = new Map<StatusKey, number>(STATUS_ORDER.map((k) => [k, 0]))
  for (const { kr } of measurable) {
    const key = statusOf(krPct(kr))
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const trend = await buildTrend(
    db,
    periodIds,
    new Set(flat.map(({ kr }) => kr.id)),
    now,
    asOf,
  )

  return {
    companyPct: overall,
    kpis: {
      depts: depts.length,
      objectives: depts.reduce((sum, d) => sum + d.objectives.length, 0),
      krs: flat.length,
      measuredKrs: measuredFlat.length,
      avgPct: overall,
      openKrs: attention.length,
    },
    depts: deptVms,
    attention,
    trend,
    distribution: STATUS_ORDER.map((status) => ({ status, count: counts.get(status) ?? 0 })),
    periodCodes: periods.map((p) => p.code),
  }
}
