'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { formatMonthLong, formatPrecise, formatValuePrecise, formatWeight } from '@/lib/domain/format'
import { fill, tx } from '@/lib/i18n/strings'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import type { KrTableVm } from '@/lib/queries/kr-table'
import styles from './key-results.module.css'

const RULE_LABEL = { sum: 'rollupSum', avg: 'rollupAvg', last: 'rollupLast' } as const

/**
 * Key Results under Yönetim — read-only. The monthly table mirrors the
 * screenshot the management asked for: Month · Target · Actual · Difference ·
 * Note · Status. Values are entered on Veri Girişi; "Düzelt" goes there.
 */
export function KrTableScreen({ vm, canEnter }: { vm: KrTableVm; canEnter: boolean }) {
  const { t, lang } = usePrefs()
  const searchParams = useSearchParams()

  // Keep the date range (and anything else) when switching key results.
  const hrefFor = (krId: string) => {
    const next = new URLSearchParams(searchParams.toString())
    next.set('kr', krId)
    return `/yonetim/key-results?${next.toString()}`
  }

  const sel = vm.selected
  // Two decimals: on a 4.75 survey target, 4.74 must not read as "4,7".
  const val = (n: number) => formatValuePrecise(n, sel?.unit ?? '', lang)
  const signed = (n: number) => {
    const s = formatPrecise(n, lang)
    return n > 0 && s !== '0' ? `+${s}` : s
  }

  return (
    <>
      <h1 className={styles.h1}>{t('navKeyResults')}</h1>
      <p className={styles.lead}>{t('krTableLead')}</p>

      {!sel ? (
        <div className={styles.card}>
          <p className={styles.empty}>{t('noKrsInRange')}</p>
        </div>
      ) : (
        <div className={styles.layout}>
          <nav className={`${styles.card} ${styles.list}`} aria-label={t('navKeyResults')}>
            {vm.depts.map((d) => (
              <div key={d.slug} className={styles.group}>
                <div className={styles.groupTitle}>
                  <span aria-hidden="true">{d.emoji}</span>
                  {tx({ tr: d.nameTr, en: d.nameEn }, lang)}
                </div>
                {d.krs.map((k) => {
                  const active = k.id === sel.id
                  return (
                    <Link
                      key={k.id}
                      href={hrefFor(k.id)}
                      scroll={false}
                      className={`${styles.krLink} ${active ? styles.krLinkActive : ''}`}
                      aria-current={active ? 'true' : undefined}
                    >
                      <span className={styles.krCode}>{k.objectiveCode}</span>
                      <span>
                        {tx({ tr: k.titleTr, en: k.titleEn }, lang)}
                        {k.weight != null ? <span className={styles.krWeight}>{formatWeight(k.weight, lang)}</span> : null}
                      </span>
                    </Link>
                  )
                })}
              </div>
            ))}
          </nav>

          <section className={styles.card} aria-labelledby="kr-title">
            <div className={styles.head}>
              <span className={styles.crumb}>
                {sel.deptEmoji} {tx({ tr: sel.deptNameTr, en: sel.deptNameEn }, lang)} · {sel.objectiveCode} ·{' '}
                {tx({ tr: sel.objectiveTitleTr, en: sel.objectiveTitleEn }, lang)} · {sel.periodCode}
              </span>
              <h2 id="kr-title" className={styles.krTitle}>{tx({ tr: sel.titleTr, en: sel.titleEn }, lang)}</h2>
              <div className={styles.facts}>
                <span>{t('thStart')}: <strong>{val(sel.start)}</strong></span>
                <span>{t('thTarget')}: <strong>{val(sel.target)}</strong></span>
                <span>{t('thCurrent')}: <strong>{val(sel.current)}</strong></span>
                <span>{t('fieldRollup')}: <strong>{t(RULE_LABEL[sel.rule])}</strong></span>
              </div>
              <span className={styles.targetNote}>
                {sel.rule === 'sum'
                  ? fill(t('monthlyTargetSum'), { target: val(sel.target), n: sel.rows.length })
                  : fill(t('monthlyTargetSame'), { target: val(sel.target), rule: t(RULE_LABEL[sel.rule]) })}
              </span>
            </div>

            <h3 className={styles.tableTitle}>{t('monthlyTable')}</h3>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th} scope="col">{t('thMonth')}</th>
                    <th className={`${styles.th} ${styles.num}`} scope="col">{t('thTarget')}</th>
                    <th className={`${styles.th} ${styles.num}`} scope="col">{t('thMonthlyTarget')}</th>
                    <th className={`${styles.th} ${styles.num}`} scope="col">{t('thActual')}</th>
                    <th className={`${styles.th} ${styles.num}`} scope="col">{t('thDiff')}</th>
                    <th className={styles.th} scope="col">{t('thNote')}</th>
                    <th className={styles.th} scope="col">{t('thStatus')}</th>
                    {canEnter ? (
                      <th className={styles.th} scope="col">
                        <span className={styles.srOnly}>{t('fixValue')}</span>
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {sel.rows.map((r) => (
                    <tr key={r.month} className={styles.row}>
                      <th className={`${styles.td} ${styles.month}`} scope="row">
                        {formatMonthLong(r.month, lang)}
                      </th>
                      <td className={`${styles.td} ${styles.num} ${styles.muted}`}>{val(sel.target)}</td>
                      <td className={`${styles.td} ${styles.num}`}>{val(r.monthlyTarget)}</td>
                      <td className={`${styles.td} ${styles.num} ${r.actual === null ? styles.muted : styles.actual}`}>
                        {r.actual === null ? '—' : val(r.actual)}
                      </td>
                      <td
                        className={`${styles.td} ${styles.num} ${
                          r.onTrack === null ? styles.muted : r.onTrack ? styles.good : styles.bad
                        }`}
                      >
                        {r.diff === null ? '—' : signed(r.diff)}
                      </td>
                      <td className={`${styles.td} ${styles.note} ${r.note ? '' : styles.muted}`}>{r.note ?? '—'}</td>
                      <td className={styles.td}>
                        <span className={`${styles.badge} ${r.status === 'entered' ? styles.badgeEntered : styles.badgePending}`}>
                          {r.status === 'entered' ? t('statusEntered') : t('statusPending')}
                        </span>
                      </td>
                      {canEnter ? (
                        <td className={styles.td}>
                          <Link
                            className={styles.fix}
                            href={`/veri-girisi?ay=${r.month}&kr=${encodeURIComponent(sel.id)}`}
                          >
                            {t('fixValue')} →
                          </Link>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </>
  )
}
