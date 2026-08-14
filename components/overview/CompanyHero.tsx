'use client'

import { statusOf } from '@/lib/domain/status'
import type { StringKey } from '@/lib/i18n/strings'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import styles from './overview.module.css'

const STATUS_LABEL: Record<ReturnType<typeof statusOf>, StringKey> = {
  above: 'statusAbove',
  expected: 'statusExpected',
  below: 'statusBelow',
  open: 'statusOpen',
  none: 'statusNotStarted',
}

interface Props {
  companyPct: number
  stats: { depts: number; objectives: number; krs: number; openKrs: number }
  /** Codes of the periods the current range covers, oldest first. */
  periodCodes: string[]
}

export function CompanyHero({ companyPct, stats, periodCodes }: Props) {
  const { t } = usePrefs()
  const periodLabel = periodCodes.join(' · ')

  return (
    <section className={styles.hero}>
      <div className={styles.heroMain}>
        <div className={styles.heroOverline}>{t('period')}</div>
        {/* No company goal statement exists in the data yet, so the heading
            names the real period instead of an invented target. */}
        <h2 className={styles.heroGoal}>{periodLabel || '—'}</h2>

        <div className={styles.heroProgressRow}>
          <span className={styles.heroProgressLabel}>{t('overallProgress')}</span>
          <span className={styles.heroProgressValue}>
            {companyPct}% · {t(STATUS_LABEL[statusOf(companyPct)])}
          </span>
        </div>

        <div
          className={styles.heroTrack}
          role="progressbar"
          aria-valuenow={companyPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t('overallProgress')}
        >
          <div className={styles.heroFill} style={{ width: `${Math.min(100, companyPct)}%` }} />
        </div>

        <p className={styles.heroNote}>{t('quarterNote')}</p>
      </div>

      <div className={styles.heroStats}>
        <div>
          <div className={styles.heroStatValue}>{stats.depts}</div>
          <div className={styles.heroStatLabel}>{t('kpiDepts')}</div>
        </div>
        <div>
          <div className={styles.heroStatValue}>{stats.objectives}</div>
          <div className={styles.heroStatLabel}>{t('kpiObjectives')}</div>
        </div>
        <div>
          <div className={styles.heroStatValue}>{stats.krs}</div>
          <div className={styles.heroStatLabel}>{t('kpiKrs')}</div>
        </div>
        <div>
          <div className={styles.heroStatValue}>{stats.openKrs}</div>
          <div className={styles.heroStatLabel}>{t('kpiOpen')}</div>
        </div>
      </div>
    </section>
  )
}
