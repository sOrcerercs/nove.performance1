'use client'

import { useRouter } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { useToast } from '@/components/ui/ToastProvider'
import { submitCheckin } from '@/lib/actions/checkins'
import { formatDaysAgo, formatValue } from '@/lib/domain/format'
import { krPct } from '@/lib/domain/progress'
import type { Confidence } from '@/lib/domain/types'
import { tx } from '@/lib/i18n/strings'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import type { CheckinCandidate } from '@/lib/queries/checkin'
import styles from './checkin.module.css'

const CheckinContext = createContext<{ open: () => void; available: boolean } | null>(null)

/** Older than this and the picker flags it — the weekly ritual has slipped. */
const STALE_DAYS = 7

const CONFIDENCES: { key: Confidence; label: 'confHigh' | 'confMid' | 'confLow'; color: string }[] = [
  { key: 'high', label: 'confHigh', color: 'var(--success-fg)' },
  { key: 'mid', label: 'confMid', color: 'var(--warning-fg)' },
  { key: 'low', label: 'confLow', color: 'var(--danger-fg)' },
]

export function CheckinProvider({
  candidates,
  children,
}: {
  candidates: CheckinCandidate[]
  children: React.ReactNode
}) {
  const { t, lang } = usePrefs()
  const router = useRouter()
  const toast = useToast()

  const [isOpen, setIsOpen] = useState(false)
  const [selected, setSelected] = useState<CheckinCandidate | null>(null)
  const [value, setValue] = useState('')
  const [confidence, setConfidence] = useState<Confidence>('mid')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const close = useCallback(() => {
    setIsOpen(false)
    setSelected(null)
    setError(null)
    setNote('')
  }, [])

  const open = useCallback(() => {
    setIsOpen(true)
    setSelected(null)
    setError(null)
  }, [])

  // Escape closes the dialog — expected of any modal.
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, close])

  function pick(c: CheckinCandidate) {
    setSelected(c)
    setValue(String(c.current))
    setConfidence(c.confidence)
    setError(null)
  }

  async function save() {
    if (!selected) return
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) {
      setError(t('invalidNumber'))
      return
    }

    setPending(true)
    setError(null)

    const result = await submitCheckin({
      keyResultId: selected.krId,
      newValue: parsed,
      confidence,
      note: note.trim() || undefined,
    })

    if (result.ok) {
      toast(t('toastCheckin'))
      close()
      router.refresh()
    } else {
      setError(tx(result.error, lang))
    }
    setPending(false)
  }

  const previewPct = selected
    ? krPct({ start: selected.start, current: Number(value) || 0, target: selected.target })
    : 0

  return (
    <CheckinContext.Provider value={{ open, available: candidates.length > 0 }}>
      {children}

      {isOpen ? (
        <div
          className={styles.backdrop}
          role="dialog"
          aria-modal="true"
          aria-label={t('weeklyCheckin')}
          onClick={(e) => { if (e.target === e.currentTarget) close() }}
        >
          <div className={styles.dialog}>
            <div className={styles.head}>
              <div>
                <h2 className={styles.title}>{t('weeklyCheckin')}</h2>
                <p className={styles.lead}>
                  {selected ? t('newValue') : t('pickKrLead')}
                </p>
              </div>
              <button type="button" className={styles.close} onClick={close} aria-label={t('cancel')}>
                ×
              </button>
            </div>

            {!selected ? (
              candidates.length === 0 ? (
                <p className={styles.empty}>{t('noCheckinKrs')}</p>
              ) : (
                <div className={styles.list}>
                  {candidates.map((c) => (
                    <button type="button" className={styles.pick} key={c.krId} onClick={() => pick(c)}>
                      <span aria-hidden="true">{c.deptEmoji}</span>
                      <span className={styles.pickMain}>
                        <span className={styles.pickTitle}>
                          {tx({ tr: c.titleTr, en: c.titleEn }, lang)}
                        </span>
                        <span className={styles.pickMeta}>
                          {formatValue(c.current, c.unit, lang)} → {formatValue(c.target, c.unit, lang)}
                          {' · '}
                          <span className={c.daysSinceUpdate >= STALE_DAYS ? styles.stale : undefined}>
                            {formatDaysAgo(c.daysSinceUpdate, lang)}
                          </span>
                        </span>
                      </span>
                      <span>{c.pct}%</span>
                    </button>
                  ))}
                </div>
              )
            ) : (
              <>
                <div className={styles.krSummary}>
                  <div className={styles.krTitle}>
                    {tx({ tr: selected.titleTr, en: selected.titleEn }, lang)}
                  </div>
                  <div className={styles.krMeta}>
                    {formatValue(selected.start, selected.unit, lang)} →{' '}
                    {formatValue(selected.target, selected.unit, lang)} · {t('thCurrent')}:{' '}
                    {formatValue(selected.current, selected.unit, lang)}
                  </div>
                </div>

                <div className={styles.field}>
                  <label className={styles.label} htmlFor="newValue">{t('newValue')}</label>
                  <input
                    id="newValue"
                    className={styles.input}
                    type="number"
                    step="any"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                  />
                </div>

                <div className={styles.field}>
                  <span className={styles.label}>{t('confidence')}</span>
                  <div className={styles.confRow}>
                    {CONFIDENCES.map((c) => (
                      <button
                        key={c.key}
                        type="button"
                        className={`${styles.conf} ${confidence === c.key ? styles.confActive : ''}`}
                        style={confidence === c.key ? { borderColor: c.color, color: c.color } : undefined}
                        aria-pressed={confidence === c.key}
                        onClick={() => setConfidence(c.key)}
                      >
                        {t(c.label)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.field}>
                  <label className={styles.label} htmlFor="note">{t('note')}</label>
                  <textarea
                    id="note"
                    className={styles.textarea}
                    placeholder={t('phNote')}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>

                <div className={styles.preview}>
                  <div className={styles.previewLabel}>{t('preview')}</div>
                  <ProgressBar pct={previewPct} label={t('preview')} />
                </div>

                {error ? <p className={styles.error} role="alert">{error}</p> : null}

                <div className={styles.footer}>
                  <button type="button" className={styles.secondary} onClick={() => setSelected(null)}>
                    ← {t('pickKr')}
                  </button>
                  <div className={styles.spacer} />
                  <button type="button" className={styles.primary} disabled={pending} onClick={save}>
                    {pending ? '…' : t('saveCheckin')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </CheckinContext.Provider>
  )
}

/** Null outside the provider, so the Topbar can render without the button. */
export function useCheckin() {
  return useContext(CheckinContext)
}
