'use client'

import Link from 'next/link'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatCount } from '@/lib/domain/format'
import { tx } from '@/lib/i18n/strings'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import type { OverviewDept } from '@/lib/queries/overview'
import styles from './overview.module.css'

export function DeptCard({ dept }: { dept: OverviewDept }) {
  const { t, lang } = usePrefs()
  const name = tx({ tr: dept.nameTr, en: dept.nameEn }, lang)

  return (
    <Link href={`/bolum/${dept.slug}`} className={styles.deptCard}>
      <div className={styles.deptTop}>
        <span className={styles.deptEmoji} aria-hidden="true">{dept.emoji}</span>
        <span className={styles.deptName}>{name}</span>
        <span className={styles.deptArrow} aria-hidden="true">→</span>
      </div>

      <div className={styles.deptBadgeRow}>
        <StatusBadge pct={dept.pct} />
      </div>

      <ProgressBar pct={dept.pct} label={`${name} ${t('overallProgress')}`} />

      <div className={styles.deptMeta}>
        {formatCount(dept.objectiveCount, 'objective', lang)} · {dept.krCount} KR
        {dept.leadName ? ` · ${dept.leadName}` : ''}
      </div>
    </Link>
  )
}
