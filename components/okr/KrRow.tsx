'use client'

import { ProgressBar } from '@/components/ui/ProgressBar'
import { formatMonth, formatValue, isBeforeCutoff } from '@/lib/domain/format'
import { isMeasurable } from '@/lib/domain/progress'
import { STATUS_VARS } from '@/lib/domain/status'
import type { Confidence } from '@/lib/domain/types'
import { tx } from '@/lib/i18n/strings'
import type { StringKey } from '@/lib/i18n/strings'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import type { KrVm } from '@/lib/queries/department'
import styles from '@/app/(app)/okr.module.css'
import badgeStyles from '@/components/ui/ui.module.css'

/** Prototype `confMeta()`: a label and a colour for each confidence level. */
const CONFIDENCE: Record<Confidence, { key: StringKey; color: string }> = {
  high: { key: 'confHigh', color: 'var(--success-fg)' },
  mid: { key: 'confMid', color: 'var(--warning-fg)' },
  low: { key: 'confLow', color: 'var(--danger-fg)' },
}

export function KrRow({ kr, asOfMonth }: { kr: KrVm; asOfMonth: string }) {
  const { t, lang, compact } = usePrefs()

  const title = tx({ tr: kr.titleTr, en: kr.titleEn }, lang)
  const conf = CONFIDENCE[kr.confidence]

  return (
    <tr className={`${styles.row} ${compact ? styles.rowCompact : ''}`}>
      <td className={styles.krTitle} title={title}>
        {title}
      </td>
      <td className={styles.num}>{formatValue(kr.start, kr.unit, lang)}</td>
      <td className={styles.numStrong}>
        {formatValue(kr.current, kr.unit, lang)}
        {/* The two markers share one slot and cannot collide: `latestMonth` is
            always `null` when nothing was measured by the cutoff, so the "son
            veri" branch is unreachable in that state. Without the second
            branch the figure below (which is `start`, not a measurement) reads
            as a genuine 0%, while the objective above it quietly excludes the
            row from its own percentage. */}
        {kr.measuredByCutoff ? (
          isBeforeCutoff(kr.latestMonth, asOfMonth) ? (
            <span className={styles.latestData}>
              {t('latestData')}: {formatMonth(kr.latestMonth, lang)}
            </span>
          ) : null
        ) : (
          <span className={styles.latestData} title={t('notMeasuredHint')}>
            {t('notMeasured')}
          </span>
        )}
      </td>
      <td className={styles.num}>{formatValue(kr.target, kr.unit, lang)}</td>
      <td>
        {isMeasurable(kr) ? (
          <ProgressBar pct={kr.pct} label={title} />
        ) : (
          <span
            className={badgeStyles.badge}
            style={{ background: STATUS_VARS.below.bg, color: STATUS_VARS.below.fg }}
            title={t('notMeasurableHint')}
          >
            <span className={badgeStyles.dot} aria-hidden="true" />
            {t('notMeasurable')}
          </span>
        )}
      </td>
      <td>
        <span className={styles.conf} style={{ color: conf.color }}>
          <span className={styles.confDot} aria-hidden="true" />
          {t(conf.key)}
        </span>
      </td>
    </tr>
  )
}
