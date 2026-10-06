'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { signOutAction } from '@/components/shell/actions'
import { fill } from '@/lib/i18n/strings'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import account from '../../(app)/hesap/account.module.css'
import { PasswordChangeForm } from '../../(app)/hesap/password-form'
import styles from './forced.module.css'

/**
 * Where a temporary password lands. No sidebar and no menu: the only ways out
 * are choosing a password or signing out. The confirmation is on this screen
 * because there is no toast provider here and a toast would not survive the
 * navigation home.
 */
export function ForcedPasswordChange({ name }: { name: string }) {
  const { t } = usePrefs()
  const router = useRouter()
  const [done, setDone] = useState(false)

  return (
    <main className={styles.page}>
      <div className={account.wrap}>
        <section className={account.card}>
          <h1 className={account.cardTitle}>{t('forcedPasswordTitle')}</h1>
          {done ? (
            <>
              <p className={account.lead} role="status">{t('toastOwnPasswordUpdated')}</p>
              <button
                type="button" className={account.primary} autoFocus
                onClick={() => {
                  router.replace('/')
                  router.refresh()
                }}
              >
                {t('continueBtn')}
              </button>
            </>
          ) : (
            <>
              <p className={account.lead}>{fill(t('forcedPasswordLead'), { name })}</p>
              <PasswordChangeForm onSuccess={() => setDone(true)} />
              <form action={signOutAction}>
                <button type="submit" className={styles.signOut}>{t('signOut')}</button>
              </form>
            </>
          )}
        </section>
      </div>
    </main>
  )
}
