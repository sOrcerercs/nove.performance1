'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useToast } from '@/components/ui/ToastProvider'
import { setObjectiveWeights } from '@/lib/actions/objective-weights'
import { checkWeights, weightTotal } from '@/lib/domain/weights'
import { fill, tx } from '@/lib/i18n/strings'
import { OBJECTIVE_WEIGHT_MESSAGES, weightProblemMessage } from '@/lib/validation/objective'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import type { DeptDetailVm, ObjectiveVm } from '@/lib/queries/department'
import styles from './editor.module.css'

const parseWeight = (s: string): number | null => (s.trim() === '' ? null : Number(s))

/**
 * Management's weights for one department's objectives — one form per period,
 * because each period's set adds up to 100 on its own.
 *
 * Deliberately no "split evenly": how much each objective counts is
 * management's call, and the only rule the system enforces is the 100% total.
 * The server re-checks everything, including that the list is still the
 * department's whole set for that period.
 */
export function ObjectiveWeightsPanel({
  deptId,
  periods,
  objectives,
}: {
  deptId: string
  periods: DeptDetailVm['periods']
  objectives: ObjectiveVm[]
}) {
  const { t } = usePrefs()
  const [open, setOpen] = useState(false)

  const sets = periods
    .map((p) => ({ period: p, objectives: objectives.filter((o) => o.periodId === p.id) }))
    .filter((s) => s.objectives.length > 0)
  if (sets.length === 0) return null

  if (!open) {
    return (
      <div className={styles.bar}>
        <button type="button" className={styles.secondary} onClick={() => setOpen(true)}>
          {t('objectiveWeights')}
        </button>
      </div>
    )
  }

  return (
    <div className={styles.panel}>
      <h3 className={styles.panelTitle}>{t('objectiveWeights')}</h3>
      <p className={styles.weightBar}>{t('objectiveWeightsHint')}</p>
      {sets.map((s) => (
        <PeriodWeights
          // Remount when the objective set or their saved weights change (e.g. after
          // router.refresh), so inputs never stay index-aligned with the wrong objective.
          key={`${s.period.id}:${s.objectives.map((o) => `${o.id}=${o.weight ?? ''}`).join(',')}`}
          deptId={deptId}
          periodId={s.period.id}
          periodCode={s.period.code}
          objectives={s.objectives}
        />
      ))}
      <div className={styles.panelActions}>
        <button type="button" className={styles.secondary} onClick={() => setOpen(false)}>
          {t('cancel')}
        </button>
      </div>
    </div>
  )
}

function PeriodWeights({
  deptId,
  periodId,
  periodCode,
  objectives,
}: {
  deptId: string
  periodId: string
  periodCode: string
  objectives: ObjectiveVm[]
}) {
  const { t, lang } = usePrefs()
  const router = useRouter()
  const toast = useToast()
  const [values, setValues] = useState<string[]>(() =>
    objectives.map((o) => (o.weight == null ? '' : String(o.weight))),
  )
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const weights = values.map(parseWeight)
  const problem = checkWeights(weights, { required: false })
  const problemMessage =
    problem === null
      ? null
      : problem === 'partial'
        ? OBJECTIVE_WEIGHT_MESSAGES.partial
        : weightProblemMessage(problem, weightTotal(weights))
  const anyWeight = values.some((v) => v.trim() !== '')

  async function onSave() {
    setPending(true)
    setError(null)
    const result = await setObjectiveWeights({
      departmentId: deptId,
      periodId,
      weights: objectives.map((o, i) => ({ objectiveId: o.id, weight: weights[i] ?? null })),
    })
    if (result.ok) {
      toast(t('toastObjectiveWeightsSaved'))
      router.refresh()
    } else {
      setError(tx(result.error, lang))
    }
    setPending(false)
  }

  return (
    <section className={styles.field} aria-label={periodCode}>
      <h4 className={styles.label}>{periodCode}</h4>
      {objectives.map((o, i) => {
        const inputId = `ow-${o.id}`
        return (
          <div className={styles.field} key={o.id}>
            <label className={styles.label} htmlFor={inputId}>
              {o.code} · {tx({ tr: o.titleTr, en: o.titleEn }, lang)}
            </label>
            <input
              id={inputId} className={styles.input} type="number" step="0.01" min="0" max="100"
              value={values[i]}
              aria-describedby={`${inputId}-unit`}
              aria-invalid={problem !== null ? true : undefined}
              onChange={(e) => {
                const v = e.target.value
                setValues((prev) => prev.map((x, j) => (j === i ? v : x)))
              }}
            />
            <small id={`${inputId}-unit`}>{t('fieldWeight')}</small>
          </div>
        )
      })}
      <div className={styles.weightBar}>
        {anyWeight ? (
          <span className={problem === null ? styles.weightOk : styles.weightOff}>
            {fill(t('weightTotal'), { total: weightTotal(weights).toLocaleString(lang === 'en' ? 'en-US' : 'tr-TR') })}
          </span>
        ) : null}
      </div>
      {problemMessage ? <p className={styles.note}>{tx(problemMessage, lang)}</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <div className={styles.panelActions}>
        <button
          type="button" className={styles.primary}
          disabled={problem !== null || pending} onClick={onSave}
        >
          {pending ? '…' : t('saveWeights')}
        </button>
      </div>
    </section>
  )
}
