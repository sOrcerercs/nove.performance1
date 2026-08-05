'use client'

import { STATUS_VARS, statusOf } from '@/lib/domain/status'
import styles from './ui.module.css'

interface Props {
  pct: number
  /** Track height in pixels. design.md §5 specifies 8px as the default. */
  height?: number
  /** Render the numeric percentage to the right of the track. */
  showValue?: boolean
  label?: string
}

export function ProgressBar({ pct, height = 8, showValue = true, label }: Props) {
  const key = statusOf(pct)
  const vars = STATUS_VARS[key]
  const notStarted = key === 'none'

  const track = (
    <div
      className={`${styles.track} ${notStarted ? styles.trackNotStarted : ''}`}
      style={{ height }}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      {!notStarted ? (
        <div
          className={styles.fill}
          style={{ width: `${Math.min(100, pct)}%`, background: vars.fg }}
        />
      ) : null}
    </div>
  )

  if (!showValue) return track

  return (
    <div className={styles.progressRow}>
      {track}
      <span className={styles.pctText} style={{ color: vars.fg }}>
        {notStarted ? '—' : `${pct}%`}
      </span>
    </div>
  )
}
