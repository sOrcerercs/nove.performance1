'use client'

import { KrRow } from '@/components/okr/KrRow'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import type { KrVm } from '@/lib/queries/department'
import styles from '@/app/(app)/okr.module.css'

/**
 * The key result grid.
 *
 * A real `<table>` rather than the prototype's flex rows: the prototype built
 * it out of divs, which leaves a screen reader with six unlabelled numbers per
 * row. The header cells carry `scope="col"` so each value is announced with
 * its column.
 */
export function KrTable({ krs, caption }: { krs: KrVm[]; caption?: string }) {
  const { t } = usePrefs()

  return (
    <div className={styles.tableScroll}>
      <table className={styles.krTable}>
        {caption ? <caption className={styles.srOnly}>{caption}</caption> : null}
        <thead>
          <tr>
            <th scope="col">{t('thKr')}</th>
            <th scope="col" className={`${styles.numHead} ${styles.colStart}`}>{t('thStart')}</th>
            <th scope="col" className={`${styles.numHead} ${styles.colCurrent}`}>{t('thCurrent')}</th>
            <th scope="col" className={`${styles.numHead} ${styles.colTarget}`}>{t('thTarget')}</th>
            <th scope="col" className={styles.colProgress}>{t('thProgress')}</th>
            <th scope="col" className={styles.colConfidence}>{t('thConfidence')}</th>
          </tr>
        </thead>
        <tbody>
          {krs.map((kr) => (
            <KrRow key={kr.id} kr={kr} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
