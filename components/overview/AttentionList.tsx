'use client'

import Link from 'next/link'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { formatMonth, formatUpdatedAgo, formatValue, isBeforeCutoff } from '@/lib/domain/format'
import { tx } from '@/lib/i18n/strings'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import type { OverviewAttentionItem } from '@/lib/queries/overview'
import styles from './overview.module.css'

/** A key result untouched for a week is worth flagging on its own. */
const STALE_DAYS = 7

export function AttentionList({
  items,
  asOfMonth,
}: {
  items: OverviewAttentionItem[]
  /** Required, like `KrRow`'s: both callers always pass it, and an optional
   *  cutoff would silently disable every "son veri" marker on this list if one
   *  ever forgot. */
  asOfMonth: string
}) {
  const { t, lang } = usePrefs()

  if (items.length === 0) {
    return <p className={styles.empty}>🎉 {t('attentionEmpty')}</p>
  }

  return (
    <div>
      {items.map((item) => {
        const title = tx({ tr: item.titleTr, en: item.titleEn }, lang)
        return (
          <div className={styles.attentionRow} key={item.krId}>
            <span aria-hidden="true">{item.deptEmoji}</span>

            <div className={styles.attentionMain}>
              <Link href={`/bolum/${item.deptSlug}`} className={styles.attentionTitle}>
                {title}
              </Link>
              <div className={styles.attentionMeta}>
                {item.ownerName} · {formatValue(item.current, item.unit, lang)} →{' '}
                {formatValue(item.target, item.unit, lang)}
                {isBeforeCutoff(item.latestMonth, asOfMonth) ? (
                  <> · {t('latestData')}: {formatMonth(item.latestMonth, lang)}</>
                ) : null}
                {' · '}
                <span className={item.daysSinceUpdate >= STALE_DAYS ? styles.stale : undefined}>
                  {formatUpdatedAgo(item.daysSinceUpdate, lang)}
                </span>
              </div>
            </div>

            <div className={styles.attentionBar}>
              <ProgressBar pct={item.pct} label={title} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
