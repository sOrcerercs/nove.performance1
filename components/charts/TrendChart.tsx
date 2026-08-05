'use client'

import { useId } from 'react'
import { formatNumber } from '@/lib/domain/format'
import type { Lang } from '@/lib/domain/types'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import { MONTHS_IN_YEAR, type OverviewTrendPoint } from '@/lib/queries/overview'
import styles from './charts.module.css'

/** Geometry ported from the prototype's `trendChart()`. */
const W = 560
const H = 190
const PAD = 26
const GRID_STEPS = [0, 25, 50, 75, 100]

const MONTH_NAMES: Record<Lang, readonly string[]> = {
  tr: ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
}

const x = (i: number): number => PAD + (i * (W - PAD * 2)) / (MONTHS_IN_YEAR - 1)
const y = (v: number): number => H - PAD - (Math.min(100, v) / 100) * (H - PAD * 2)

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
  if (!last || !first) return null

  const points = trend.map((p, i) => `${x(i)},${y(p.actual)}`).join(' ')
  const area = [
    `M ${x(0)} ${y(first.actual)}`,
    ...trend.map((p, i) => `L ${x(i)} ${y(p.actual)}`),
    `L ${x(trend.length - 1)} ${H - PAD}`,
    `L ${x(0)} ${H - PAD}`,
    'Z',
  ].join(' ')

  const behind = last.actual < last.pace
  const label = [
    t('trendTitle'),
    `${months[trend.length - 1] ?? ''}: ${formatNumber(last.actual, lang)}%`,
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

      {trend.map((p, i) => (
        <circle
          key={p.month}
          className={styles.actualDot}
          cx={x(i)}
          cy={y(p.actual)}
          r={i === trend.length - 1 ? 5 : 3.5}
        />
      ))}

      {months.map((m, i) => (
        <text
          key={m}
          className={i < trend.length ? styles.tickPast : styles.tickFuture}
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
