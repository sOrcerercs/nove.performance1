'use client'

import { useState } from 'react'
import { useToast } from '@/components/ui/ToastProvider'
import { changeOwnPassword } from '@/lib/actions/admin'
import type { Role } from '@/lib/domain/types'
import { fill, ROLE_KEY, tx } from '@/lib/i18n/strings'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import styles from './account.module.css'

const MIN_LENGTH = 12

export function AccountForm({
  name,
  email,
  role,
}: {
  name: string
  email: string
  role: Role
}) {
  const toast = useToast()

  const { t, lang } = usePrefs()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const mismatch = confirm.length > 0 && next !== confirm
  const canSubmit =
    current.length > 0 && next.length >= MIN_LENGTH && next === confirm && !pending

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)

    const result = await changeOwnPassword({ currentPassword: current, newPassword: next })

    if (result.ok) {
      toast(t('toastOwnPasswordUpdated'))
      setCurrent('')
      setNext('')
      setConfirm('')
    } else {
      setError(tx(result.error, lang))
    }
    setPending(false)
  }

  return (
    <div className={styles.wrap}>
      <h1 className={styles.h1}>{t('myAccount')}</h1>

      <section className={styles.card}>
        <dl className={styles.info}>
          <dt className={styles.dt}>{t('fullName')}</dt>
          <dd className={styles.dd}>{name}</dd>
          <dt className={styles.dt}>{t('email')}</dt>
          <dd className={styles.dd}>{email}</dd>
          <dt className={styles.dt}>{t('thRole')}</dt>
          <dd className={styles.dd}>{t(ROLE_KEY[role])}</dd>
        </dl>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>{t('changePassword')}</h2>
        <p className={styles.lead}>
          {fill(t('passwordLead'), { n: MIN_LENGTH })}
        </p>

        <form onSubmit={onSubmit}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="current">{t('currentPassword')}</label>
            <input
              id="current" className={styles.input} type="password"
              autoComplete="current-password"
              value={current} onChange={(e) => setCurrent(e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="next">{t('newPassword')}</label>
            <input
              id="next" className={styles.input} type="password"
              autoComplete="new-password"
              value={next} onChange={(e) => setNext(e.target.value)}
            />
            {next.length > 0 && next.length < MIN_LENGTH ? (
              <p className={styles.hintWarn}>
                {fill(t('charsNeeded'), { n: MIN_LENGTH - next.length })}
              </p>
            ) : null}
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="confirm">{t('newPasswordAgain')}</label>
            <input
              id="confirm" className={styles.input} type="password"
              autoComplete="new-password"
              value={confirm} onChange={(e) => setConfirm(e.target.value)}
            />
            {mismatch ? <p className={styles.hintWarn}>{t('passwordsMismatch')}</p> : null}
          </div>

          {error ? <p className={styles.error} role="alert">{error}</p> : null}

          <button type="submit" className={styles.primary} disabled={!canSubmit}>
            {pending ? '…' : t('updatePassword')}
          </button>
        </form>
      </section>
    </div>
  )
}
