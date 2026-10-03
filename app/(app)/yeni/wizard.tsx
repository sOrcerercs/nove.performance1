'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useToast } from '@/components/ui/ToastProvider'
import { createObjective } from '@/lib/actions/objectives'
import type { RollupRule } from '@/lib/domain/types'
import { tx } from '@/lib/i18n/strings'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import type { AssignablePerson } from '@/lib/queries/people'
import { titleHint } from '@/lib/validation/objective'

import styles from './wizard.module.css'

/**
 * People offered as owners: the department's own first, then everyone else.
 * Cross-department assignment stays possible — someone in İK can legitimately
 * own a result that sits in another department.
 */
function peopleFor(people: AssignablePerson[], deptId: string): AssignablePerson[] {
  const mine = people.filter((p) => p.departmentId === deptId)
  const rest = people.filter((p) => p.departmentId !== deptId)
  return [...mine, ...rest]
}


export interface WizardDept {
  id: string
  emoji: string
  nameTr: string
  nameEn: string
}

interface KrDraft {
  title: string
  start: string
  current: string
  target: string
  unit: string
  /** Empty until chosen: there is deliberately no default rule. */
  rollup: RollupRule | ''
  ownerUserId: string
}

const emptyKr = (): KrDraft => ({
  title: '', start: '0', current: '', target: '100', unit: '%', rollup: '', ownerUserId: '',
})

const ROLLUPS: { key: RollupRule; label: 'rollupSum' | 'rollupAvg' | 'rollupLast' }[] = [
  { key: 'sum', label: 'rollupSum' },
  { key: 'avg', label: 'rollupAvg' },
  { key: 'last', label: 'rollupLast' },
]

const MAX_KRS = 5

export function Wizard({
  depts,
  defaultDeptId,
  periodCode,
  people,
}: {
  depts: WizardDept[]
  defaultDeptId: string
  periodCode: string
  people: AssignablePerson[]
}) {
  const { t, lang } = usePrefs()
  const router = useRouter()
  const toast = useToast()

  const [step, setStep] = useState<1 | 2>(1)
  const [title, setTitle] = useState('')
  const [deptId, setDeptId] = useState(defaultDeptId)
  const [ownerUserId, setOwnerUserId] = useState('')
  const [krs, setKrs] = useState<KrDraft[]>([emptyKr(), emptyKr()])
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const hint = titleHint(title)
  // Mirrors the server schema: a title plus at least one complete key result.
  const filledKrs = krs.filter((k) => k.title.trim().length >= 3)
  const rulesMissing = filledKrs.some((k) => k.rollup === '')
  const isValid = title.trim().length > 0 && filledKrs.length >= 1 && !rulesMissing

  const editKr = (i: number, patch: Partial<KrDraft>) =>
    setKrs((prev) => prev.map((k, j) => (j === i ? { ...k, ...patch } : k)))

  async function onSave() {
    setPending(true)
    setError(null)

    const result = await createObjective({
      title,
      departmentId: deptId,
      ownerUserId: ownerUserId || null,
      periodCode,
      krs: filledKrs.map((k) => ({
        title: k.title,
        start: Number(k.start),
        // Blank means "not started yet"; the server falls back to the start value.
        current: k.current.trim() === '' ? undefined : Number(k.current),
        target: Number(k.target),
        unit: k.unit,
        rollup: k.rollup as RollupRule, // guaranteed by isValid
        ownerUserId: k.ownerUserId || null,
      })),
    })

    if (result.ok) {
      toast(t('toastCreated'))
      router.push(`/bolum/${result.data.deptSlug}`)
      router.refresh()
    } else {
      setError(tx(result.error, lang))
      setPending(false)
    }
  }

  return (
    <div className={styles.wrap}>
      <h1>{t('createTitle')}</h1>
      <p className={styles.lead}>{t('createLead')}</p>

      <ol className={styles.steps}>
        <li className={`${styles.step} ${step === 1 ? styles.stepActive : styles.stepDone}`}>
          {t('step1')}
        </li>
        <li className={`${styles.step} ${step === 2 ? styles.stepActive : ''}`}>
          {t('step2')}
        </li>
      </ol>

      {step === 1 ? (
        <div className={styles.card}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="title">{t('fieldObjective')}</label>
            <input
              id="title"
              className={styles.input}
              value={title}
              placeholder={t('phObjective')}
              onChange={(e) => setTitle(e.target.value)}
            />
            {hint !== 'empty' ? (
              <p className={`${styles.hint} ${hint === 'ok' ? styles.hintOk : styles.hintWarn}`}>
                {hint === 'ok' ? t('titleHintOk') : t('titleHintShort')}
              </p>
            ) : null}
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="dept">{t('fieldDept')}</label>
              <select
                id="dept"
                className={styles.select}
                value={deptId}
                onChange={(e) => setDeptId(e.target.value)}
              >
                {depts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.emoji} {lang === 'en' ? d.nameEn : d.nameTr}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="owner">{t('fieldOwner')}</label>
              <select
                id="owner"
                className={styles.select}
                value={ownerUserId}
                onChange={(e) => setOwnerUserId(e.target.value)}
              >
                <option value="">{t('ownerMeUnassigned')}</option>
                {peopleFor(people, deptId).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="period">{t('fieldPeriod')}</label>
              <input id="period" className={styles.input} value={periodCode} readOnly />
            </div>
          </div>

          <div className={styles.footer}>
            <div className={styles.footerSpacer} />
            <button
              type="button"
              className={styles.primary}
              disabled={title.trim().length === 0}
              onClick={() => setStep(2)}
            >
              {t('step2')} →
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.card}>
          {krs.map((kr, i) => (
            // Index keys are safe here: rows are only appended and removed,
            // and each row's state lives in this same array.
            <div className={styles.krCard} key={i}>
              <div className={styles.krHead}>
                <span className={styles.krIndex}>{t('fieldKr')} {i + 1}</span>
                <button
                  type="button"
                  className={styles.remove}
                  disabled={krs.length <= 1}
                  onClick={() => setKrs((prev) => prev.filter((_, j) => j !== i))}
                >
                  {t('remove')}
                </button>
              </div>

              <div className={styles.field}>
                <input
                  className={styles.input}
                  value={kr.title}
                  placeholder={t('phKr')}
                  aria-label={`${t('fieldKr')} ${i + 1}`}
                  onChange={(e) => editKr(i, { title: e.target.value })}
                />
              </div>

              <div className={styles.krRow}>
                <div>
                  <label className={styles.label}>{t('thStart')}</label>
                  <input
                    className={styles.input}
                    type="number"
                    value={kr.start}
                    onChange={(e) => editKr(i, { start: e.target.value })}
                  />
                </div>
                <div>
                  <label className={styles.label}>{t('thCurrent')}</label>
                  <input
                    className={styles.input}
                    type="number"
                    step="any"
                    placeholder={kr.start}
                    aria-label={`${t('fieldKr')} ${i + 1} ${t('thCurrent')}`}
                    value={kr.current}
                    onChange={(e) => editKr(i, { current: e.target.value })}
                  />
                </div>
                <div>
                  <label className={styles.label}>{t('thTarget')}</label>
                  <input
                    className={styles.input}
                    type="number"
                    value={kr.target}
                    onChange={(e) => editKr(i, { target: e.target.value })}
                  />
                </div>
                <div>
                  <label className={styles.label}>{t('fieldUnit')}</label>
                  <input
                    className={styles.input}
                    value={kr.unit}
                    onChange={(e) => editKr(i, { unit: e.target.value })}
                  />
                </div>
                <div>
                  <label className={styles.label}>{t('fieldRollup')}</label>
                  <select
                    className={styles.select}
                    value={kr.rollup}
                    required
                    aria-label={`${t('fieldKr')} ${i + 1} ${t('fieldRollup')}`}
                    aria-invalid={kr.title.trim().length >= 3 && kr.rollup === '' ? true : undefined}
                    onChange={(e) => editKr(i, { rollup: e.target.value as RollupRule })}
                  >
                    <option value="" disabled>{t('chooseRule')}</option>
                    {ROLLUPS.map((r) => (
                      <option key={r.key} value={r.key}>{t(r.label)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={styles.label}>{t('fieldOwner')}</label>
                  <select
                    className={styles.select}
                    value={kr.ownerUserId}
                    aria-label={`${t('fieldKr')} ${i + 1} ${t('fieldOwner')}`}
                    onChange={(e) => editKr(i, { ownerUserId: e.target.value })}
                  >
                    <option value="">{t('objectiveOwner')}</option>
                    {peopleFor(people, deptId).map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ))}

          <button
            type="button"
            className={styles.addKr}
            disabled={krs.length >= MAX_KRS}
            onClick={() => setKrs((prev) => [...prev, emptyKr()])}
          >
            + {t('addKr')}
          </button>
          <p className={styles.countHint}>
            {t('krCountHint')} · <strong>{t('thCurrent')}</strong> {t('currentBlankNote')}
          </p>
          <p className={styles.countHint}>{t('rollupHint')}</p>

          {error ? <p className={styles.error} role="alert">{error}</p> : null}

          <div className={styles.footer}>
            <button type="button" className={styles.secondary} onClick={() => setStep(1)}>
              ← {t('step1')}
            </button>
            <span
              className={`${styles.validation} ${isValid ? styles.validationOk : styles.validationMissing}`}
            >
              {isValid ? t('validationReady') : rulesMissing ? t('ruleMissing') : t('validationMissing')}
            </span>
            <div className={styles.footerSpacer} />
            <button
              type="button"
              className={styles.primary}
              disabled={!isValid || pending}
              onClick={onSave}
            >
              {pending ? '…' : t('save')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
