'use client'

import { useState } from 'react'
import { useToast } from '@/components/ui/ToastProvider'
import { changeOwnPassword } from '@/lib/actions/admin'
import type { Role } from '@/lib/domain/types'
import styles from './account.module.css'

const ROLE_LABEL: Record<Role, string> = {
  admin: 'Yönetici',
  executive: 'Üst Yönetim',
  staff: 'Personel',
}

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
      toast('Parolan güncellendi')
      setCurrent('')
      setNext('')
      setConfirm('')
    } else {
      setError(result.error)
    }
    setPending(false)
  }

  return (
    <div className={styles.wrap}>
      <h1 className={styles.h1}>Hesabım</h1>

      <section className={styles.card}>
        <dl className={styles.info}>
          <dt className={styles.dt}>Ad Soyad</dt>
          <dd className={styles.dd}>{name}</dd>
          <dt className={styles.dt}>E-posta</dt>
          <dd className={styles.dd}>{email}</dd>
          <dt className={styles.dt}>Rol</dt>
          <dd className={styles.dd}>{ROLE_LABEL[role]}</dd>
        </dl>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Parola değiştir</h2>
        <p className={styles.lead}>
          En az {MIN_LENGTH} karakter. Mevcut parolan, oturumun açık olsa bile doğrulanır.
        </p>

        <form onSubmit={onSubmit}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="current">Mevcut parola</label>
            <input
              id="current" className={styles.input} type="password"
              autoComplete="current-password"
              value={current} onChange={(e) => setCurrent(e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="next">Yeni parola</label>
            <input
              id="next" className={styles.input} type="password"
              autoComplete="new-password"
              value={next} onChange={(e) => setNext(e.target.value)}
            />
            {next.length > 0 && next.length < MIN_LENGTH ? (
              <p className={styles.hintWarn}>
                {MIN_LENGTH - next.length} karakter daha gerekli.
              </p>
            ) : null}
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="confirm">Yeni parola (tekrar)</label>
            <input
              id="confirm" className={styles.input} type="password"
              autoComplete="new-password"
              value={confirm} onChange={(e) => setConfirm(e.target.value)}
            />
            {mismatch ? <p className={styles.hintWarn}>Parolalar eşleşmiyor.</p> : null}
          </div>

          {error ? <p className={styles.error} role="alert">{error}</p> : null}

          <button type="submit" className={styles.primary} disabled={!canSubmit}>
            {pending ? '…' : 'Parolayı güncelle'}
          </button>
        </form>
      </section>
    </div>
  )
}
