'use client'

import { ProgressBar } from '@/components/ui/ProgressBar'
import { formatValue } from '@/lib/domain/format'
import type { Confidence } from '@/lib/domain/types'
import { tx } from '@/lib/i18n/strings'
import type { StringKey } from '@/lib/i18n/strings'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import type { KrVm } from '@/lib/queries/department'
import styles from '@/app/(app)/okr.module.css'

/** Prototype `confMeta()`: a label and a colour for each confidence level. */
const CONFIDENCE: Record<Confidence, { key: StringKey; color: string }> = {
  high: { key: 'confHigh', color: 'var(--success-fg)' },
  mid: { key: 'confMid', color: 'var(--warning-fg)' },
  low: { key: 'confLow', color: 'var(--danger-fg)' },
}

export function KrRow({ kr }: { kr: KrVm }) {
  const { t, lang, compact } = usePrefs()

  const title = tx({ tr: kr.titleTr, en: kr.titleEn }, lang)
  const conf = CONFIDENCE[kr.confidence]

  return (
    <tr className={`${styles.row} ${compact ? styles.rowCompact : ''}`}>
      <td className={styles.krTitle} title={title}>
        {title}
      </td>
      <td className={styles.num}>{formatValue(kr.start, kr.unit, lang)}</td>
      <td className={styles.numStrong}>{formatValue(kr.current, kr.unit, lang)}</td>
      <td className={styles.num}>{formatValue(kr.target, kr.unit, lang)}</td>
      <td>
        <ProgressBar pct={kr.pct} label={title} />
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
