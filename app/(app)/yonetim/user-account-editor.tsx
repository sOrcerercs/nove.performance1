'use client'

import { useState } from 'react'
import { updateUserAccount } from '@/lib/actions/admin'
import { canSignIn, type Role } from '@/lib/domain/types'
import { ROLE_KEY, tx } from '@/lib/i18n/strings'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import styles from './admin.module.css'

const ROLES: Role[] = ['admin', 'executive', 'staff']

export interface EditableUser {
  id: string
  name: string
  email: string | null
  role: Role
  hasPassword: boolean
}

/**
 * The Düzenle panel under a Kullanıcılar row: email, role and a temporary
 * password. A generated password is shown once and dropped from state on
 * Close; the server keeps only its hash.
 */
export function UserAccountEditor({
  user,
  isSelf,
  onDone,
  onCancel,
}: {
  user: EditableUser
  isSelf: boolean
  onDone: () => void
  onCancel: () => void
}) {
  const { t, lang } = usePrefs()
  const [email, setEmail] = useState(user.email ?? '')
  const [role, setRole] = useState<Role>(user.role)
  const [issue, setIssue] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [issued, setIssued] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Staff hold no credential and your own password changes from My Account,
  // so neither is offered one. A sign-in role with no password yet must get one.
  const offered = canSignIn(role) && !isSelf
  const forced = offered && !user.hasPassword
  const issueTempPassword = forced || (offered && issue)

  async function onSave() {
    setPending(true)
    setError(null)
    const result = await updateUserAccount({
      userId: user.id,
      email: email.trim() || null,
      role,
      issueTempPassword,
    })
    setPending(false)
    if (!result.ok) {
      setError(tx(result.error, lang))
      return
    }
    if (result.data.tempPassword) setIssued(result.data.tempPassword)
    else onDone()
  }

  async function onCopy() {
    if (!issued) return
    try {
      await navigator.clipboard.writeText(issued)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  function onClose() {
    setIssued(null)
    onDone()
  }

  if (issued) {
    return (
      <div className={styles.editPanel} role="group" aria-label={`${user.name} ${t('edit')}`}>
        <p className={styles.tempLabel}>{t('tempPasswordLabel')}</p>
        <div className={styles.resetRow}>
          <code className={styles.tempPassword}>{issued}</code>
          <button type="button" className={styles.linkBtn} onClick={onCopy}>
            {copied ? t('copied') : t('copy')}
          </button>
        </div>
        <p className={styles.tempNote}>{t('tempPasswordNote')}</p>
        <button type="button" className={styles.primary} onClick={onClose}>{t('close')}</button>
      </div>
    )
  }

  // A named group: the new-user form on the same screen also has fields
  // labelled "email" and "role", so tests and screen readers scope to this.
  return (
    <div className={styles.editPanel} role="group" aria-label={`${user.name} ${t('edit')}`}>
      <div className={styles.resetRow}>
        <input
          className={`${styles.input} ${styles.inputEmail}`} type="email" autoComplete="off"
          placeholder={t('email')} aria-label={t('email')} disabled={pending}
          value={email} onChange={(e) => setEmail(e.target.value)}
        />
        <select
          className={styles.select} aria-label={t('thRole')} disabled={pending}
          value={role} onChange={(e) => setRole(e.target.value as Role)}
        >
          {ROLES.map((r) => <option key={r} value={r}>{t(ROLE_KEY[r])}</option>)}
        </select>
      </div>

      {offered ? (
        <label className={styles.checkRow}>
          <input
            type="checkbox" checked={issueTempPassword} disabled={forced || pending}
            onChange={(e) => setIssue(e.target.checked)}
          />
          {t('tempPasswordIssue')}
          {forced ? <span className={styles.userEmail}> — {t('tempPasswordForced')}</span> : null}
        </label>
      ) : null}

      {error ? <p className={styles.error} role="alert">{error}</p> : null}

      <div className={styles.resetRow}>
        <button type="button" className={styles.primary} disabled={pending} onClick={onSave}>
          {t('saveBtn')}
        </button>
        <button type="button" className={styles.linkBtn} disabled={pending} onClick={onCancel}>
          {t('cancel')}
        </button>
      </div>
    </div>
  )
}
