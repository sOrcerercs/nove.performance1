'use client'

import { useState } from 'react'
import { changeOwnPassword } from '@/lib/actions/admin'
import { fill, tx } from '@/lib/i18n/strings'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import styles from './account.module.css'

export const MIN_LENGTH = 12

export function PasswordChangeForm({ onSuccess }: { onSuccess: () => void }) {
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
      setCurrent('')
      setNext('')
      setConfirm('')
      onSuccess()
    } else {
      setError(tx(result.error, lang))
    }
    setPending(false)
  }

  return (
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
  )
}
