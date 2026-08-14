'use client'

import { useId } from 'react'
import { formatNumber, MONTH_NAMES } from '@/lib/domain/format'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import { MONTHS_IN_YEAR, type OverviewTrendPoint } from '@/lib/queries/overview'
import styles from './charts.module.css'

/** Geometry ported from the prototype's `trendChart()`. Exported for tests,
 *  which need to pin exactly where a point lands on the calendar axis. */
export const W = 560
export const H = 190
export const PAD = 26
const GRID_STEPS = [0, 25, 50, 75, 100]

/** Pixel position for a calendar month index (0 = January, 11 = December). */
export const x = (i: number): number => PAD + (i * (W - PAD * 2)) / (MONTHS_IN_YEAR - 1)
const y = (v: number): number => H - PAD - (Math.min(100, v) / 100) * (H - PAD * 2)

/**
 * A point's place on the Jan–Dec axis comes from its own `month` field, never
 * from its position in the `trend` array. `buildTrend` may emit a single
 * point mid-year, or — once real monthly rollups exist — a sparse series with
 * gaps (say March, May, August). Indexing by array position would squeeze
 * those into January/February/March, closing up the very gaps that are the
 * point of a sparse series.
 */
const monthIndexOf = (p: OverviewTrendPoint): number => Number(p.month) - 1

/**
 * Company progress by month: a filled actual line against a dashed straight-line
 * target pace, so "are we ahead or behind schedule" is a single glance.
 */
export function TrendChart({ trend }: { trend: OverviewTrendPoint[] }) {
  const { t, lang } = usePrefs()
  // Two charts on one page would otherwise share a gradient id.
  const gradientId = `nove-trend-area-${useId()}`
  const months = MONTH_NAMES[lang]

  const last = trend[trend.length - 1]
  const first = trend[0]
  // No history yet is an expected state (see `buildTrend`), not a rendering
  // error — say so explicitly instead of leaving an unexplained empty box.
  if (!last || !first) return <p className={styles.empty}>{t('trendEmpty')}</p>

  const points = trend.map((p) => `${x(monthIndexOf(p))},${y(p.actual)}`).join(' ')
  const area = [
    `M ${x(monthIndexOf(first))} ${y(first.actual)}`,
    ...trend.map((p) => `L ${x(monthIndexOf(p))} ${y(p.actual)}`),
    `L ${x(monthIndexOf(last))} ${H - PAD}`,
    `L ${x(monthIndexOf(first))} ${H - PAD}`,
    'Z',
  ].join(' ')

  const lastMonthIndex = monthIndexOf(last)
  const behind = last.actual < last.pace
  const label = [
    t('trendTitle'),
    `${months[lastMonthIndex] ?? ''}: ${formatNumber(last.actual, lang)}%`,
    `${t('targetPace')}: ${formatNumber(last.pace, lang)}%`,
    lang === 'tr'
      ? behind
        ? 'hedef temponun gerisinde'
        : 'hedef temponun önünde'
      : behind
        ? 'behind the target pace'
        : 'ahead of the target pace',
  ].join(' · ')

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={`${styles.svg} ${styles.svgOverflow}`}
      role="img"
      aria-label={label}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" className={styles.areaTop} />
          <stop offset="100%" className={styles.areaBottom} />
        </linearGradient>
      </defs>

      {GRID_STEPS.map((v) => (
        <g key={v}>
          <line className={styles.gridLine} x1={PAD} x2={W - PAD} y1={y(v)} y2={y(v)} />
          <text className={styles.axisLabel} x={PAD - 8} y={y(v) + 4} textAnchor="end">
            {formatNumber(v, lang)}%
          </text>
        </g>
      ))}

      {/* Target pace: a straight line from 0% in January to 100% in December. */}
      <line
        className={styles.paceLine}
        x1={x(0)}
        y1={y(0)}
        x2={x(MONTHS_IN_YEAR - 1)}
        y2={y(100)}
      />

      <path d={area} fill={`url(#${gradientId})`} />
      <polyline className={styles.actualLine} points={points} />

      {trend.map((p) => (
        <circle
          key={p.month}
          className={styles.actualDot}
          cx={x(monthIndexOf(p))}
          cy={y(p.actual)}
          r={p.month === last.month ? 5 : 3.5}
        />
      ))}

      {months.map((m, i) => (
        <text
          key={m}
          // "Past" means "already elapsed", not "has a data point" — a sparse
          // series can skip months that have already happened just as easily
          // as ones still ahead, so the cutoff is the most recent point's
          // month, not membership in `trend`.
          className={i <= lastMonthIndex ? styles.tickPast : styles.tickFuture}
          x={x(i)}
          y={H - 6}
          textAnchor="middle"
        >
          {m}
        </text>
      ))}
    </svg>
  )
}

/** Legend for the trend chart — the two series are also told apart by shape. */
export function TrendLegend() {
  const { t } = usePrefs()
  return (
    <div className={styles.legend}>
      <span className={styles.legendItem}>
        <span className={styles.swatchLine} aria-hidden="true" />
        {t('actual')}
      </span>
      <span className={styles.legendItem}>
        <span className={styles.swatchDashed} aria-hidden="true" />
        {t('targetPace')}
      </span>
    </div>
  )
}
