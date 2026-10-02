import Link from 'next/link'
import { getT } from '@/lib/i18n/server'
import styles from './(app)/error.module.css'

/**
 * Shown for an unknown route and for any `notFound()` call — a mistyped
 * department slug or an objective id from a period that no longer holds it.
 */
export default async function NotFound() {
  const t = await getT()
  return (
    <main className={styles.wrap} style={{ minHeight: '100vh' }}>
      <div className={styles.card}>
        <span className={styles.icon} aria-hidden="true">🧭</span>
        <h1 className={styles.title}>{t('notFoundTitle')}</h1>
        <p className={styles.body}>
          {t('notFoundBody')}
        </p>
        <div className={styles.actions}>
          <Link className={styles.secondary} href="/">
            {t('backToOverview')}
          </Link>
        </div>
      </div>
    </main>
  )
}
