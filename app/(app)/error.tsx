'use client'

import { useEffect } from 'react'
import styles from './error.module.css'

/**
 * Server errors inside the app shell.
 *
 * Without this, Next shows its own bare English "Application error" page in
 * production — a poor last impression for an internal Turkish tool, and it
 * offers the user no way forward. `reset()` re-renders the failed segment,
 * which is enough to recover from a transient database hiccup.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // The digest is what correlates this screen with the server log entry;
    // the message itself is withheld from the client in production.
    console.error('[nove-pys] beklenmeyen hata', error.digest ?? error.message)
  }, [error])

  return (
    <main className={styles.wrap}>
      <div className={styles.card}>
        <span className={styles.icon} aria-hidden="true">⚠️</span>
        <h1 className={styles.title}>Bir şeyler ters gitti</h1>
        <p className={styles.body}>
          Bu ekran yüklenirken beklenmeyen bir hata oluştu. Tekrar denemek
          sorunu çözebilir; sürerse veritabanı bağlantısını kontrol edin.
        </p>
        {error.digest ? (
          <p className={styles.digest}>
            Hata kodu: <code>{error.digest}</code>
          </p>
        ) : null}
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={reset}>
            Tekrar dene
          </button>
          <a className={styles.secondary} href="/">
            Performans Özeti’ne dön
          </a>
        </div>
      </div>
    </main>
  )
}
