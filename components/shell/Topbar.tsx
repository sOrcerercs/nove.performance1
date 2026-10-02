'use client'

import { useCheckin } from '@/components/checkin/CheckinProvider'
import type { Lang } from '@/lib/domain/types'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import type { RangeSelection } from '@/lib/queries/range'
import { DateRangePicker } from './DateRangePicker'
import styles from './shell.module.css'

interface Props {
  overline: string
  title: string
  selection: RangeSelection
}

export function Topbar({ overline, title, selection }: Props) {
  const { t, lang, setLang, compact, setCompact } = usePrefs()
  const checkin = useCheckin()

  return (
    <header className={styles.topbar}>
      <div className={styles.crumbs}>
        <div className={styles.crumbOverline}>{overline}</div>
        <div className={styles.crumbTitle}>{title}</div>
      </div>

      <DateRangePicker
        presets={selection.presets}
        preset={selection.preset}
        range={selection.range}
      />

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

      <div className={styles.segmented} role="group" aria-label={t('language')}>
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
