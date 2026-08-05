import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth/session'
import { LoginForm } from './login-form'
import styles from './login.module.css'

export default async function LoginPage() {
  if (await currentUser()) redirect('/')

  return (
    <div className={styles.page}>
      <section className={styles.brand}>
        <div className={styles.brandTop}>
          <div className={styles.mark}>N</div>
          <div className={styles.wordmark}>
            <span className={styles.wordmarkName}>Nove PYS</span>
            <span className={styles.wordmarkSub}>Performans</span>
          </div>
        </div>

        <div className={styles.pitch}>
          <h2 className={styles.pitchTitle}>
            Yıllık hedef, çeyreklik ölçüm, haftalık check-in.
          </h2>
          <p className={styles.pitchBody}>
            Sekiz bölümün objective ve key resultlarını tek ekranda izleyin;
            neyin beklenen seviyede, neyin gelişime açık olduğunu anında görün.
          </p>
        </div>

        <div className={styles.stats}>
          <div>
            <div className={styles.statValue}>8</div>
            <div className={styles.statLabel}>Bölüm</div>
          </div>
          <div>
            <div className={styles.statValue}>9</div>
            <div className={styles.statLabel}>Objective</div>
          </div>
          <div>
            <div className={styles.statValue}>25</div>
            <div className={styles.statLabel}>Key result</div>
          </div>
        </div>
      </section>

      <section className={styles.formSide}>
        <LoginForm showSeedHint={process.env.NODE_ENV !== 'production'} />
      </section>
    </div>
  )
}
