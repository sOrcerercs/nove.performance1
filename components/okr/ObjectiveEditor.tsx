'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useToast } from '@/components/ui/ToastProvider'
import {
  deleteObjective,
  objectiveDeletionImpact,
  updateObjective,
} from '@/lib/actions/objectives'
import { todayInIstanbul } from '@/lib/domain/dates'
import type { Confidence, RollupRule } from '@/lib/domain/types'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import type { ObjectiveDetailVm } from '@/lib/queries/department'
import type { AssignablePerson } from '@/lib/queries/people'
import styles from './editor.module.css'

interface KrDraft {
  id?: string
  title: string
  start: string
  /**
   * Display only, never sent back: `current` is a derived summary of
   * `kr_monthly_values` (see `lib/actions/core/monthly.ts`), not a field this
   * form may set directly. `null` for a key result added in this session,
   * which has no monthly rows yet.
   */
  currentDisplay: number | null
  target: string
  unit: string
  confidence: Confidence
  rollup: RollupRule
  ownerUserId: string
}

interface Impact {
  keyResults: number
  checkins: number
}

const MAX_KRS = 5

const CONFIDENCES: { key: Confidence; label: 'confHigh' | 'confMid' | 'confLow' }[] = [
  { key: 'high', label: 'confHigh' },
  { key: 'mid', label: 'confMid' },
  { key: 'low', label: 'confLow' },
]

const ROLLUPS: { key: RollupRule; label: 'rollupSum' | 'rollupAvg' | 'rollupLast' }[] = [
  { key: 'sum', label: 'rollupSum' },
  { key: 'avg', label: 'rollupAvg' },
  { key: 'last', label: 'rollupLast' },
]

/**
 * Computed once at module load, not per render: the "fix a wrong figure"
 * link only needs to land on *a* sensible month, and the monthly entry
 * screen already falls back sanely if this one is not in the open period by
 * the time the link is clicked.
 */
const CURRENT_MONTH = todayInIstanbul().slice(0, 7)

/** Department's own people first; cross-department assignment stays allowed. */
function peopleFor(people: AssignablePerson[], deptId: string): AssignablePerson[] {
  const mine = people.filter((p) => p.departmentId === deptId)
  const rest = people.filter((p) => p.departmentId !== deptId)
  return [...mine, ...rest]
}

export function ObjectiveEditor({
  obj,
  people,
}: {
  obj: ObjectiveDetailVm
  people: AssignablePerson[]
}) {
  const { t, lang } = usePrefs()
  const router = useRouter()
  const toast = useToast()

  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(lang === 'en' ? obj.titleEn : obj.titleTr)
  const [krs, setKrs] = useState<KrDraft[]>(() =>
    obj.krs.map((k) => ({
      id: k.id,
      title: lang === 'en' ? k.titleEn : k.titleTr,
      start: String(k.start),
      currentDisplay: k.current,
      target: String(k.target),
      unit: k.unit,
      confidence: k.confidence,
      rollup: k.rollup,
      ownerUserId: k.ownerUserId ?? '',
    })),
  )
  const [ownerUserId, setOwnerUserId] = useState(obj.ownerUserId ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  // Delete is two-step: asking for the impact first, then confirming it.
  const [impact, setImpact] = useState<Impact | null>(null)

  const editKr = (i: number, patch: Partial<KrDraft>) =>
    setKrs((prev) => prev.map((k, j) => (j === i ? { ...k, ...patch } : k)))

  const valid = title.trim().length > 0 && krs.length > 0 &&
    krs.every((k) => k.title.trim().length >= 3)

  async function onSave() {
    setPending(true)
    setError(null)

    const result = await updateObjective({
      id: obj.id,
      title,
      ownerUserId: ownerUserId || null,
      krs: krs.map((k) => ({
        ...(k.id ? { id: k.id } : {}),
        title: k.title,
        start: Number(k.start),
        target: Number(k.target),
        unit: k.unit,
        confidence: k.confidence,
        rollup: k.rollup,
        ownerUserId: k.ownerUserId || null,
      })),
    })

    if (result.ok) {
      toast('Objective güncellendi')
      setOpen(false)
      router.refresh()
    } else {
      setError(result.error)
    }
    setPending(false)
  }

  async function askDelete() {
    setError(null)
    const result = await objectiveDeletionImpact(obj.id)
    if (result.ok) setImpact(result.data)
    else setError(result.error)
  }

  async function confirmDelete() {
    setPending(true)
    const result = await deleteObjective({ id: obj.id })
    if (result.ok) {
      toast('Objective silindi')
      router.push(`/bolum/${result.data.deptSlug}`)
      router.refresh()
    } else {
      setError(result.error)
      setPending(false)
    }
  }

  if (!open) {
    return (
      <div className={styles.bar}>
        <button type="button" className={styles.secondary} onClick={() => setOpen(true)}>
          Düzenle
        </button>
        <button type="button" className={styles.danger} onClick={askDelete}>
          Sil
        </button>

        {error ? <p className={styles.error} role="alert">{error}</p> : null}

        {impact ? (
          <div className={styles.confirm} role="alertdialog">
            <p className={styles.confirmText}>
              <strong>Bu işlem geri alınamaz.</strong> Objective ile birlikte{' '}
              {impact.keyResults} key result ve {impact.checkins} check-in kaydı silinecek.
            </p>
            <div className={styles.confirmActions}>
              <button
                type="button" className={styles.secondary}
                onClick={() => setImpact(null)} disabled={pending}
              >
                {t('cancel')}
              </button>
              <button
                type="button" className={styles.danger}
                onClick={confirmDelete} disabled={pending}
              >
                {pending ? '…' : 'Evet, sil'}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className={styles.panel}>
      <h3 className={styles.panelTitle}>Objective’i düzenle</h3>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="obj-title">{t('fieldObjective')}</label>
        <input
          id="obj-title" className={styles.input}
          value={title} onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="obj-owner">{t('fieldOwner')}</label>
        <select
          id="obj-owner" className={styles.input}
          value={ownerUserId} onChange={(e) => setOwnerUserId(e.target.value)}
        >
          <option value="">—</option>
          {peopleFor(people, obj.deptId).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {krs.map((kr, i) => (
        // Index keys are safe: rows are only appended or removed, and each
        // row's state lives in this same array.
        <div className={styles.krCard} key={i}>
          <div className={styles.krHead}>
            <span className={styles.krIndex}>
              {t('fieldKr')} {i + 1}{kr.id ? '' : ' · yeni'}
            </span>
            <button
              type="button" className={styles.remove} disabled={krs.length <= 1}
              onClick={() => setKrs((prev) => prev.filter((_, j) => j !== i))}
            >
              {t('remove')}
            </button>
          </div>

          <input
            className={styles.input} value={kr.title}
            aria-label={`${t('fieldKr')} ${i + 1}`}
            onChange={(e) => editKr(i, { title: e.target.value })}
          />

          <div className={styles.row}>
            <div>
              <label className={styles.label}>{t('thStart')}</label>
              <input
                className={styles.input} type="number" step="any" value={kr.start}
                onChange={(e) => editKr(i, { start: e.target.value })}
              />
            </div>
            <div>
              {/* `current` is a derived summary (see `KrDraft.currentDisplay`'s
                  comment) — shown for context, never editable here. A rollup
                  change below recomputes it from the key result's monthly rows.
                  A wrong figure is fixed on the monthly entry screen, which
                  this link jumps to — pre-aimed at this key result and the
                  current month — rather than left with no way out. */}
              <label className={styles.label}>{t('thCurrent')}</label>
              <input
                className={styles.input} type="text" disabled readOnly
                value={kr.currentDisplay === null ? '—' : String(kr.currentDisplay)}
              />
              {kr.id ? (
                <Link
                  className={styles.currentLink}
                  href={`/veri-girisi?ay=${CURRENT_MONTH}&kr=${encodeURIComponent(kr.id)}`}
                >
                  {t('fixInMonthlyEntry')}
                </Link>
              ) : null}
            </div>
            <div>
              <label className={styles.label}>{t('thTarget')}</label>
              <input
                className={styles.input} type="number" step="any" value={kr.target}
                onChange={(e) => editKr(i, { target: e.target.value })}
              />
            </div>
            <div>
              <label className={styles.label}>{t('fieldUnit')}</label>
              <input
                className={styles.input} value={kr.unit}
                onChange={(e) => editKr(i, { unit: e.target.value })}
              />
            </div>
            <div>
              <label className={styles.label}>{t('thConfidence')}</label>
              <select
                className={styles.input} value={kr.confidence}
                onChange={(e) => editKr(i, { confidence: e.target.value as Confidence })}
              >
                {CONFIDENCES.map((c) => (
                  <option key={c.key} value={c.key}>{t(c.label)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={styles.label}>{t('fieldRollup')}</label>
              <select
                className={styles.input} value={kr.rollup}
                aria-label={`${t('fieldKr')} ${i + 1} ${t('fieldRollup')}`}
                onChange={(e) => editKr(i, { rollup: e.target.value as RollupRule })}
              >
                {ROLLUPS.map((r) => (
                  <option key={r.key} value={r.key}>{t(r.label)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={styles.label}>{t('fieldOwner')}</label>
              <select
                className={styles.input} value={kr.ownerUserId}
                aria-label={`${t('fieldKr')} ${i + 1} ${t('fieldOwner')}`}
                onChange={(e) => editKr(i, { ownerUserId: e.target.value })}
              >
                <option value="">Objective sorumlusu</option>
                {peopleFor(people, obj.deptId).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      ))}

      <button
        type="button" className={styles.addKr} disabled={krs.length >= MAX_KRS}
        onClick={() =>
          setKrs((prev) => [
            ...prev,
            {
              title: '', start: '0', currentDisplay: null, target: '100',
              unit: '%', confidence: 'mid', rollup: 'last', ownerUserId: '',
            },
          ])
        }
      >
        + {t('addKr')}
      </button>

      {error ? <p className={styles.error} role="alert">{error}</p> : null}

      <div className={styles.panelActions}>
        <button
          type="button" className={styles.secondary}
          onClick={() => { setOpen(false); setError(null) }}
        >
          {t('cancel')}
        </button>
        <button
          type="button" className={styles.primary}
          disabled={!valid || pending} onClick={onSave}
        >
          {pending ? '…' : t('save')}
        </button>
      </div>
    </div>
  )
}
