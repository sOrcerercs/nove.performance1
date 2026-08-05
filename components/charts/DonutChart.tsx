'use client'

import { formatNumber } from '@/lib/domain/format'
import { STATUS_VARS } from '@/lib/domain/status'
import type { StatusKey } from '@/lib/domain/types'
import type { StringKey } from '@/lib/i18n/strings'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import type { OverviewDistributionSlice } from '@/lib/queries/overview'
import styles from './charts.module.css'

const STATUS_LABEL: Record<StatusKey, StringKey> = {
  above: 'statusAbove',
  expected: 'statusExpected',
  below: 'statusBelow',
  open: 'statusOpen',
  none: 'statusNotStarted',
}

const SIZE = 148
const RADIUS = 58
const STROKE = 22
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/**
 * Key result status distribution.
 *
 * The ring is paired with a labelled legend rather than left as bare colour:
 * the count and the status name are readable without distinguishing the hues
 * (design.md §2.4).
 */
export function DonutChart({ slices }: { slices: OverviewDistributionSlice[] }) {
  const { t, lang } = usePrefs()
  const total = slices.reduce((sum, s) => sum + s.count, 0)

  // Arcs are laid out by walking the ring; each one is a dashed stroke whose
  // single dash is its share of the circumference.
  let offset = 0
  const arcs = slices
    .filter((s) => s.count > 0)
    .map((s) => {
      const length = total === 0 ? 0 : (s.count / total) * CIRCUMFERENCE
      const arc = { status: s.status, length, offset }
      offset += length
      return arc
    })

  const label = `${t('distributionTitle')} — ${slices
    .map((s) => `${t(STATUS_LABEL[s.status])}: ${formatNumber(s.count, lang)}`)
    .join(', ')}`

  return (
    <div className={styles.donutLayout}>
      <div className={styles.donutFigure}>
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className={styles.svg}
          role="img"
          aria-label={label}
        >
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            <circle
              className={styles.donutTrack}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              strokeWidth={STROKE}
            />
            {arcs.map((a) => (
              <circle
                key={a.status}
                className={styles.donutArc}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                strokeWidth={STROKE}
                strokeDasharray={`${a.length} ${CIRCUMFERENCE - a.length}`}
                strokeDashoffset={-a.offset}
                style={{ stroke: STATUS_VARS[a.status].fg }}
              />
            ))}
          </g>
          <text className={styles.donutTotal} x={SIZE / 2} y={SIZE / 2 + 2} textAnchor="middle">
            {formatNumber(total, lang)}
          </text>
          <text className={styles.donutCaption} x={SIZE / 2} y={SIZE / 2 + 20} textAnchor="middle">
            KR
          </text>
        </svg>
      </div>

      <ul className={styles.statusLegend}>
        {slices.map((s) => (
          <li key={s.status} className={styles.statusRow}>
            <span
              className={styles.statusDot}
              style={{ background: STATUS_VARS[s.status].fg }}
              aria-hidden="true"
            />
            <span className={styles.statusName}>{t(STATUS_LABEL[s.status])}</span>
            <span className={styles.statusCount}>{formatNumber(s.count, lang)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
