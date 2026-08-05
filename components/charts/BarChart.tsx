'use client'

import { formatNumber } from '@/lib/domain/format'
import { STATUS_VARS, statusOf } from '@/lib/domain/status'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import styles from './charts.module.css'

export interface BarRow {
  key: string
  emoji: string
  name: string
  pct: number
}

/** Geometry ported from the prototype's `barChart()`, widened so the department
 *  name fits next to its emoji instead of the emoji standing alone. */
const W = 560
const ROW_H = 30
const LABEL_W = 170
const VALUE_W = 48
const TRACK_W = W - LABEL_W - VALUE_W
/** The dashed guide sits at the 70% "on track" threshold. */
const TARGET = 70

/** Department comparison: one horizontal bar per department, longest first. */
export function BarChart({ rows, title }: { rows: BarRow[]; title: string }) {
  const { lang } = usePrefs()
  const height = rows.length * ROW_H + 24

  const label = `${title} — ${rows
    .map((r) => `${r.name} ${formatNumber(r.pct, lang)}%`)
    .join(', ')}`

  return (
    <svg viewBox={`0 0 ${W} ${height}`} className={styles.svg} role="img" aria-label={label}>
      {/* On-track threshold, so a bar can be read against a target and not just
          against its neighbours. */}
      <line
        className={styles.targetMark}
        x1={LABEL_W + TRACK_W * (TARGET / 100)}
        x2={LABEL_W + TRACK_W * (TARGET / 100)}
        y1={0}
        y2={height - 12}
      />

      {rows.map((r, i) => {
        const top = i * ROW_H + 8
        const vars = STATUS_VARS[statusOf(r.pct)]
        return (
          <g key={r.key}>
            <text className={styles.barEmoji} x={0} y={top + 14}>
              {r.emoji}
            </text>
            <text className={styles.barName} x={24} y={top + 14}>
              {r.name}
            </text>
            <rect className={styles.barTrack} x={LABEL_W} y={top + 3} width={TRACK_W} height={14} rx={7} />
            <rect
              x={LABEL_W}
              y={top + 3}
              width={Math.max(3, (Math.min(100, r.pct) / 100) * TRACK_W)}
              height={14}
              rx={7}
              style={{ fill: vars.fg }}
            />
            <text
              className={styles.barValue}
              x={W}
              y={top + 15}
              textAnchor="end"
              style={{ fill: vars.fg }}
            >
              {formatNumber(r.pct, lang)}%
            </text>
          </g>
        )
      })}
    </svg>
  )
}
