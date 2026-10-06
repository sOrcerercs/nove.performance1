'use client'

import { useToast } from '@/components/ui/ToastProvider'
import type { Role } from '@/lib/domain/types'
import { fill, ROLE_KEY } from '@/lib/i18n/strings'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import styles from './account.module.css'
import { MIN_LENGTH, PasswordChangeForm } from './password-form'

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
  const { t } = usePrefs()
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

      <section className={styles.card} id="parola">
        <h2 className={styles.cardTitle}>{t('changePassword')}</h2>
        <p className={styles.lead}>
          {fill(t('passwordLead'), { n: MIN_LENGTH })}
        </p>
        <PasswordChangeForm onSuccess={() => toast(t('toastOwnPasswordUpdated'))} />
      </section>
    </div>
  )
}
