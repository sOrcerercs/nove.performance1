'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCheckin } from '@/components/checkin/CheckinProvider'
import type { Lang } from '@/lib/domain/types'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import type { PeriodOption } from '@/lib/queries/periods'
import styles from './shell.module.css'

interface Props {
  overline: string
  title: string
  periods: PeriodOption[]
  activePeriod: string
}

/** Turkish month names for the monthly period labels. */
const MONTHS_TR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
]
const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function periodLabel(p: PeriodOption, lang: Lang): string {
  if (p.kind === 'quarter') return p.code
  const [year, month] = p.code.split('-')
  const idx = Number(month) - 1
  const names = lang === 'en' ? MONTHS_EN : MONTHS_TR
  return `${names[idx] ?? month} ${year}`
}

export function Topbar({ overline, title, periods, activePeriod }: Props) {
  const { t, lang, setLang, compact, setCompact } = usePrefs()
  const checkin = useCheckin()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()


  /** Period lives in the URL so a filtered view is shareable and survives reload. */
  function goTo(code: string) {
    const next = new URLSearchParams(searchParams.toString())
    next.set('period', code)
    router.push(`${pathname}?${next.toString()}`)
  }

  return (
    <header className={styles.topbar}>
      <div className={styles.crumbs}>
        <div className={styles.crumbOverline}>{overline}</div>
        <div className={styles.crumbTitle}>{title}</div>
      </div>

      <div className={styles.control}>
        <span className={styles.controlLabel}>{t('period')}</span>

        <select
          className={styles.select}
          value={activePeriod}
          aria-label={t('period')}
          onChange={(e) => goTo(e.target.value)}
        >
          {periods.map((p) => (
            <option key={p.code} value={p.code}>
              {periodLabel(p, lang)}
              {p.state === 'active' ? ' •' : ''}
            </option>
          ))}
        </select>
      </div>

      {checkin?.available ? (
        <button type="button" className={styles.checkinButton} onClick={checkin.open}>
          ✓ {t('checkin')}
        </button>
      ) : null}

      {/* Row density — the prototype's "Kompakt" switch. The preference was
          already plumbed through to the key-result tables; this is its control. */}
      <button
        type="button"
        className={`${styles.checkinButton} ${compact ? styles.densityOn : ''}`}
        aria-pressed={compact}
        title={t('compactMode')}
        onClick={() => setCompact(!compact)}
      >
        {compact ? '▤' : '▥'} {t('compactMode')}
      </button>

      <div className={styles.segmented} role="group" aria-label="Dil">
        {(['tr', 'en'] as Lang[]).map((l) => (
          <button
            key={l}
            type="button"
            className={`${styles.segment} ${lang === l ? styles.segmentActive : ''}`}
            aria-pressed={lang === l}
            onClick={() => setLang(l)}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>
    </header>
  )
}
