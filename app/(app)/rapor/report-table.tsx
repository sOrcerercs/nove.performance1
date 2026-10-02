'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatAsOf, formatCount, formatDaysAgo, formatValue } from '@/lib/domain/format'
import { tx, type StringKey } from '@/lib/i18n/strings'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import {
  sortReportRows,
  type ReportSortKey,
  type ReportVm,
  type SortDirection,
} from '@/lib/queries/report'
import styles from './report.module.css'

const COLUMNS: { key: ReportSortKey; label: StringKey; numeric: boolean }[] = [
  { key: 'name', label: 'thDept', numeric: false },
  { key: 'objectives', label: 'thObjectives', numeric: true },
  { key: 'krs', label: 'thKrs', numeric: true },
  { key: 'openToDev', label: 'thOpen', numeric: true },
  { key: 'pct', label: 'thProgress', numeric: false },
  { key: 'status', label: 'thStatus', numeric: false },
]

export function ReportTable({
  vm,
  asOf,
  today,
}: {
  vm: ReportVm
  /** The range's end. Produced server-side, never `new Date()` on the client. */
  asOf: string
  /** Produced via `todayInIstanbul(new Date())` on the server. */
  today: string
}) {
  const { t, lang } = usePrefs()
  const [sortKey, setSortKey] = useState<ReportSortKey>('pct')
  const [direction, setDirection] = useState<SortDirection>('desc')

  const rows = useMemo(
    () => sortReportRows(vm.rows, sortKey, direction, lang),
    [vm.rows, sortKey, direction, lang],
  )

  function toggle(key: ReportSortKey) {
    if (key === sortKey) {
      setDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      // Names read naturally A-Z; every other column is most-interesting-first.
      setDirection(key === 'name' ? 'asc' : 'desc')
    }
  }

  return (
    <>
      <h1 className={styles.h1}>{t('reportTitle')}</h1>
      <p className={styles.lead}>
        {t('clickToSort')}
        {asOf < today ? ` · ${formatAsOf(asOf, lang)}` : ''}
      </p>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>{t('deptTable')}</h2>
          <span className={styles.cardMeta}>
            {formatCount(vm.totals.objectives, 'objective', lang)} · {vm.totals.krs} KR
          </span>
        </div>

        <table className={styles.table}>
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={`${styles.th} ${col.numeric ? styles.thNum : ''}`}
                  aria-sort={
                    sortKey === col.key
                      ? direction === 'asc' ? 'ascending' : 'descending'
                      : 'none'
                  }
                >
                  <button
                    type="button"
                    className={`${styles.sortBtn} ${sortKey === col.key ? styles.sortActive : ''}`}
                    onClick={() => toggle(col.key)}
                  >
                    {t(col.label)}
                    {sortKey === col.key ? (
                      <span className={styles.arrow} aria-hidden="true">
                        {direction === 'asc' ? '▲' : '▼'}
                      </span>
                    ) : null}
                  </button>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => (
              <tr className={styles.row} key={r.slug}>
                <td className={styles.td}>
                  <span className={styles.deptCell}>
                    <span aria-hidden="true">{r.emoji}</span>
                    <span>
                      <Link href={`/bolum/${r.slug}`} className={styles.deptName}>
                        {tx({ tr: r.nameTr, en: r.nameEn }, lang)}
                      </Link>
                      {r.leadName ? <div className={styles.leadName}>{r.leadName}</div> : null}
                    </span>
                  </span>
                </td>
                <td className={`${styles.td} ${styles.tdNum}`}>{r.objectives}</td>
                <td className={`${styles.td} ${styles.tdNum}`}>{r.krs}</td>
                <td className={`${styles.td} ${styles.tdNum}`}>{r.openKrs}</td>
                <td className={`${styles.td} ${styles.progressCell}`}>
                  <ProgressBar pct={r.pct} label={tx({ tr: r.nameTr, en: r.nameEn }, lang)} />
                </td>
                <td className={styles.td}><StatusBadge pct={r.pct} /></td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className={styles.totals}>
          <span>
            <span className={styles.totalLabel}>{t('kpiAvg')}: </span>
            <span className={styles.totalValue}>{vm.totals.companyPct}%</span>
          </span>
          <span>
            <span className={styles.totalLabel}>{t('kpiOpen')}: </span>
            <span className={styles.totalValue}>{vm.totals.openKrs}</span>
          </span>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>{t('attentionTitle')}</h2>
          <span className={styles.cardMeta}>{t('kpiOpenMeta')}</span>
        </div>

        {vm.openToDev.length === 0 ? (
          <p className={styles.empty}>{t('noAttentionKrs')}</p>
        ) : (
          vm.openToDev.map((kr) => (
            <div className={styles.openRow} key={kr.id}>
              <span aria-hidden="true">{kr.deptEmoji}</span>
              <div className={styles.openMain}>
                <div className={styles.openTitle}>{tx({ tr: kr.titleTr, en: kr.titleEn }, lang)}</div>
                <div className={styles.openMeta}>
                  {kr.ownerName} · {formatValue(kr.current, kr.unit, lang)} →{' '}
                  {formatValue(kr.target, kr.unit, lang)} · {formatDaysAgo(kr.daysSinceUpdate, lang)}
                </div>
              </div>
              <div className={styles.openBar}>
                <ProgressBar pct={kr.pct} label={tx({ tr: kr.titleTr, en: kr.titleEn }, lang)} />
              </div>
            </div>
          ))
        )}
      </section>
    </>
  )
}
