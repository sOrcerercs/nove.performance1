import Link from 'next/link'
import styles from './(app)/error.module.css'

/**
 * Shown for an unknown route and for any `notFound()` call — a mistyped
 * department slug or an objective id from a period that no longer holds it.
 */
export default function NotFound() {
  return (
    <main className={styles.wrap} style={{ minHeight: '100vh' }}>
      <div className={styles.card}>
        <span className={styles.icon} aria-hidden="true">🧭</span>
        <h1 className={styles.title}>Sayfa bulunamadı</h1>
        <p className={styles.body}>
          Aradığınız kayıt silinmiş olabilir ya da seçili dönemde bulunmuyor.
        </p>
        <div className={styles.actions}>
          <Link className={styles.secondary} href="/">
            Performans Özeti’ne dön
          </Link>
        </div>
      </div>
    </main>
  )
}
