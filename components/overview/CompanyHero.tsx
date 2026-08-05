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

/** The annual company goal, carried over verbatim from the prototype. */
const COMPANY_GOAL = {
  tr: '2026’da 12.000 uluslararası misafire kusursuz bakım ve %41 brüt marj',
  en: 'Flawless care for 12,000 international guests in 2026, at a 41% gross margin',
}

interface Props {
  companyPct: number
  stats: { depts: number; objectives: number; krs: number; openKrs: number }
}

export function CompanyHero({ companyPct, stats }: Props) {
  const { t, lang } = usePrefs()

  return (
    <section className={styles.hero}>
      <div className={styles.heroMain}>
        <div className={styles.heroOverline}>
          {t('companyGoal')} · 2026
        </div>
        <h2 className={styles.heroGoal}>{lang === 'en' ? COMPANY_GOAL.en : COMPANY_GOAL.tr}</h2>

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
