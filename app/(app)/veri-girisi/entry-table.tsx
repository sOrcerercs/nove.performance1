'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useToast } from '@/components/ui/ToastProvider'
import { setMonthlyValues } from '@/lib/actions/admin'
import type { SetMonthlyValueInput } from '@/lib/actions/core/monthly'
import { formatValue } from '@/lib/domain/format'
import { tx } from '@/lib/i18n/strings'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import type { MonthlyEntryVm } from '@/lib/queries/monthly'
import styles from './entry.module.css'

const ROLLUP_LABEL_KEY = {
  sum: 'rollupSum',
  avg: 'rollupAvg',
  last: 'rollupLast',
} as const

/**
 * A row's draft input, keyed by `krId`.
 *
 * The empty string is the "not entered" state — distinct from `0`, which is a
 * real measurement someone typed. Only a row whose draft parses to a finite
 * number and differs from what was loaded is "dirty" and gets sent on save;
 * a blank draft is never sent, whatever the loaded value was.
 */
export function EntryTable({ vm }: { vm: MonthlyEntryVm }) {
  const { t, lang } = usePrefs()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const toast = useToast()

  const [drafts, setDrafts] = useState<Record<string, string>>(() => initialDrafts(vm))
  const [loadedMonth, setLoadedMonth] = useState(vm.month)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Arriving from the objective editor's "fix a wrong figure" link: the
  // referenced row is scrolled into view and marked, so a table listing
  // every department's key results does not leave the one that was clicked
  // through for to be hunted down by eye.
  const highlightKrId = searchParams.get('kr')
  useEffect(() => {
    if (!highlightKrId) return
    document.getElementById(krRowId(highlightKrId))?.scrollIntoView({ block: 'center' })
  }, [highlightKrId, vm.month])

  // A new `vm` (month switched, or a fresh save landed via router.refresh)
  // resets the drafts to what is now on the server. Adjusting state during
  // render, same pattern DateRangePicker uses to resync on a new prop.
  if (loadedMonth !== vm.month) {
    setLoadedMonth(vm.month)
    setDrafts(initialDrafts(vm))
  }

  function onMonthChange(month: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('ay', month)
    router.push(`${pathname}?${params.toString()}`)
  }

  function onDraftChange(krId: string, raw: string) {
    setDrafts((prev) => ({ ...prev, [krId]: raw }))
  }

  const allRows = vm.depts.flatMap((d) => d.rows)
  const originalByKr = new Map(allRows.map((r) => [r.krId, r.value]))

  // The link out of ObjectiveEditor can point at a key result whose objective
  // is not in the currently open period (a closed-period back-fill, most
  // likely) — this table only ever shows the open period, there is no picker.
  // Rather than the row just silently not being there, say so once, plainly,
  // without trying to diagnose which of several possible causes it was.
  const highlightMissing = highlightKrId !== null && !allRows.some((r) => r.krId === highlightKrId)

  const dirty = allRows.filter((r) => r.canEdit && isDirty(drafts[r.krId], originalByKr.get(r.krId) ?? null))
  const dirtyCount = dirty.length

  async function onSave() {
    const month = vm.month
    if (dirty.length === 0 || !month) return
    setPending(true)
    setError(null)

    const items: SetMonthlyValueInput[] = dirty.map((r) => ({
      krId: r.krId,
      month,
      value: Number(drafts[r.krId] ?? ''),
    }))

    const result = await setMonthlyValues(items)
    setPending(false)

    if (!result.ok) {
      setError(tx(result.error, lang))
      return
    }
    const failed = result.data.filter((r) => !r.ok)
    if (failed.length > 0) {
      // Names the failed rows — the dirty-row highlighting that survives the
      // refresh already shows *which* inputs to retry, but the banner should
      // not make the user go hunting for them too.
      const names = failed
        .map((f) => allRows.find((r) => r.krId === f.krId))
        .filter((r): r is (typeof allRows)[number] => r !== undefined)
        .map((r) => tx({ tr: r.titleTr, en: r.titleEn }, lang))
      setError(`${t('monthlyEntryPartialError')}: ${names.join(', ')}`)
    } else {
      toast(t('toastMonthlyEntrySaved'))
    }
    router.refresh()
  }

  if (vm.months.length === 0 || vm.month === null) {
    return (
      <>
        <h1 className={styles.h1}>{t('monthlyEntryTitle')}</h1>
        <p className={styles.lead}>{t('monthlyEntryLead')}</p>
        <div className={styles.empty}>{t('noOpenPeriod')}</div>
      </>
    )
  }

  return (
    <>
      <h1 className={styles.h1}>{t('monthlyEntryTitle')}</h1>
      <p className={styles.lead}>{t('monthlyEntryLead')}</p>

      {highlightMissing ? (
        <p className={styles.notice} role="status">{t('krNotInEntryTable')}</p>
      ) : null}

      <div className={styles.hint} role="note">
        <span className={styles.hintIcon} aria-hidden="true">ℹ️</span>
        <span>{t('emptyMeansNotEntered')}</span>
      </div>

      {error ? <p className={styles.error} role="alert">{error}</p> : null}

      <div className={styles.toolbar}>
        <span className={styles.controlLabel}>{t('monthLabel')}</span>
        <select
          className={styles.select}
          aria-label={t('monthLabel')}
          value={vm.month}
          onChange={(e) => onMonthChange(e.target.value)}
        >
          {vm.months.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        <span className={styles.counter}>
          {vm.filledCount}/{vm.editableCount} {t('filledOfTotal')}
        </span>

        <span className={styles.spacer} />

        {dirtyCount > 0 ? (
          <span className={styles.dirtyCount}>{dirtyCount} {t('unsavedChanges')}</span>
        ) : null}

        <button
          type="button"
          className={styles.primary}
          disabled={pending || dirtyCount === 0}
          onClick={onSave}
        >
          {pending ? '…' : t('saveEntries')}
        </button>
      </div>

      {vm.depts.map((dept) => (
        <section className={styles.card} key={dept.id}>
          <div className={styles.cardHead}>
            <span aria-hidden="true">{dept.emoji}</span>
            <span className={styles.cardTitle}>{tx({ tr: dept.nameTr, en: dept.nameEn }, lang)}</span>
            <span className={styles.cardCount}>{dept.rows.length}</span>
          </div>

          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col" className={styles.th}>{t('thKr')}</th>
                <th scope="col" className={styles.th}>{t('thTarget')}</th>
                <th scope="col" className={`${styles.th} ${styles.thValue}`}>{t('thValue')}</th>
              </tr>
            </thead>
            <tbody>
              {dept.rows.map((row) => {
                const draft = drafts[row.krId] ?? ''
                const rowDirty = row.canEdit && isDirty(draft, row.value)
                const rowHighlighted = row.krId === highlightKrId
                return (
                  <tr
                    key={row.krId}
                    id={krRowId(row.krId)}
                    className={`${styles.row} ${rowDirty ? styles.rowDirty : ''} ${!row.canEdit ? styles.rowReadOnly : ''} ${rowHighlighted ? styles.rowHighlighted : ''}`}
                  >
                    <td className={styles.td}>
                      {tx({ tr: row.titleTr, en: row.titleEn }, lang)}
                      <div className={styles.tdMeta}>{t(ROLLUP_LABEL_KEY[row.rollup])}</div>
                    </td>
                    <td className={styles.td}>{formatValue(row.target, row.unit, lang)}</td>
                    <td className={`${styles.td} ${styles.valueCell}`}>
                      <input
                        type="number"
                        step="any"
                        inputMode="decimal"
                        className={`${styles.valueInput} ${rowDirty ? styles.valueInputDirty : ''}`}
                        aria-label={`${tx({ tr: row.titleTr, en: row.titleEn }, lang)} — ${vm.month}`}
                        title={!row.canEdit ? t('readOnlyRowHint') : undefined}
                        value={draft}
                        disabled={!row.canEdit || pending}
                        onChange={(e) => onDraftChange(row.krId, e.target.value)}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      ))}
    </>
  )
}

/** The anchor id a row is found by — shared between the row and the effect that scrolls to it. */
function krRowId(krId: string): string {
  return `kr-row-${krId}`
}

function initialDrafts(vm: MonthlyEntryVm): Record<string, string> {
  const drafts: Record<string, string> = {}
  for (const row of vm.depts.flatMap((d) => d.rows)) {
    drafts[row.krId] = row.value === null ? '' : String(row.value)
  }
  return drafts
}

/**
 * A draft counts as a pending change only when it is a real number and
 * differs from what is on file. A blank draft is never dirty — whether the
 * field started empty or the user cleared it back out — because there is no
 * "unset" action to send: clearing a field back to blank simply abandons the
 * edit rather than queuing an unsupported delete.
 */
function isDirty(draft: string | undefined, original: number | null): boolean {
  const trimmed = (draft ?? '').trim()
  if (trimmed === '') return false
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) return false
  return parsed !== original
}
