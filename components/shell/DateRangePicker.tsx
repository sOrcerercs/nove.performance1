'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import type { DateRange } from '@/lib/domain/dates'
import { formatDate } from '@/lib/domain/format'
import type { PresetKey, PresetOption } from '@/lib/domain/range-presets'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import styles from './shell.module.css'

interface Props {
  presets: PresetOption[]
  preset: PresetKey
  range: DateRange
}

/** Preset key → i18n key. */
const PRESET_LABEL = {
  fy: 'presetFy',
  period: 'presetPeriod',
  prevFy: 'presetPrevFy',
} as const

export function DateRangePicker({ presets, preset, range }: Props) {
  const { t, lang } = usePrefs()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [customOpen, setCustomOpen] = useState(preset === 'custom')
  const [from, setFrom] = useState(range.from)
  const [to, setTo] = useState(range.to)

  // The picker is not remounted on navigation, so when the resolved range
  // changes underneath it the draft inputs have to follow. Adjusting state
  // during render is React's documented alternative to an effect here.
  const [lastRange, setLastRange] = useState(range)
  if (lastRange.from !== range.from || lastRange.to !== range.to) {
    setLastRange(range)
    setCustomOpen(preset === 'custom')
    setFrom(range.from)
    setTo(range.to)
  }

  /**
   * The range lives in the URL so a filtered view is shareable and survives a
   * reload. Presets are written out as resolved dates rather than by name: a
   * link shared today must still show the same data tomorrow.
   */
  function apply(next: DateRange) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('from', next.from)
    params.set('to', next.to)
    // `period` is the pre-range parameter. Leaving it behind would be harmless
    // today (an explicit range wins) but confusing in a shared link.
    params.delete('period')
    router.push(`${pathname}?${params.toString()}`)
    // Next only appends the query string to a segment's `__PAGE__` key
    // (`addSearchParamsIfPageSegment`), so a searchParams-only push leaves
    // every *layout* segment unchanged and the client reuses its cached
    // render — the sidebar, which renders in the layout, would keep showing
    // the previous range's numbers beside an already-updated page. `refresh()`
    // re-renders from the root so the layout re-executes and the middleware's
    // `x-search-params` header reflects the new URL.
    router.refresh()
  }

  function onSelect(value: string) {
    if (value === 'custom') {
      setCustomOpen(true)
      return
    }
    setCustomOpen(false)
    const chosen = presets.find((p) => p.key === value)
    if (chosen) apply(chosen.range)
  }

  const invalid = !from || !to || from > to

  return (
    <div className={styles.control}>
      <span className={styles.controlLabel}>{t('dateRange')}</span>

      <select
        className={styles.select}
        value={customOpen ? 'custom' : preset}
        aria-label={t('dateRange')}
        onChange={(e) => onSelect(e.target.value)}
      >
        {presets.map((p) => (
          <option key={p.key} value={p.key}>
            {t(PRESET_LABEL[p.key])}
          </option>
        ))}
        <option value="custom">{t('presetCustom')}</option>
      </select>

      {customOpen ? (
        <>
          <input
            type="date"
            className={styles.dateInput}
            value={from}
            aria-label={t('rangeFrom')}
            onChange={(e) => setFrom(e.target.value)}
          />
          <span className={styles.rangeLabel}>→</span>
          <input
            type="date"
            className={styles.dateInput}
            value={to}
            aria-label={t('rangeTo')}
            onChange={(e) => setTo(e.target.value)}
          />
          <button
            type="button"
            className={styles.checkinButton}
            disabled={invalid}
            onClick={() => apply({ from, to })}
          >
            {t('apply')}
          </button>
        </>
      ) : (
        <span className={styles.rangeLabel}>
          {formatDate(range.from, lang)} – {formatDate(range.to, lang)}
        </span>
      )}
    </div>
  )
}
