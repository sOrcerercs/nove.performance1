'use client'

import { STATUS_VARS, statusOf } from '@/lib/domain/status'
import type { StatusKey } from '@/lib/domain/types'
import type { StringKey } from '@/lib/i18n/strings'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import styles from './ui.module.css'

const LABEL_KEY: Record<StatusKey, StringKey> = {
  above: 'statusAbove',
  expected: 'statusExpected',
  below: 'statusBelow',
  open: 'statusOpen',
  none: 'statusNotStarted',
}

export function StatusBadge({ pct }: { pct: number }) {
  const { t } = usePrefs()
  const key = statusOf(pct)
  const vars = STATUS_VARS[key]

  return (
    <span className={styles.badge} style={{ background: vars.bg, color: vars.fg }}>
      <span className={styles.dot} aria-hidden="true" />
      {t(LABEL_KEY[key])}
    </span>
  )
}
