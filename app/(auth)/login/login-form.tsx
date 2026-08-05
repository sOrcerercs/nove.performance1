'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { signInWithPassword } from './actions'
import styles from './login.module.css'

export function LoginForm({ showSeedHint }: { showSeedHint: boolean }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)

    try {
      const result = await signInWithPassword({ email, password })
      if (result.ok) {
        // Full refresh so the server layout re-reads the new session cookie.
        router.replace('/')
        router.refresh()
        return
      }
      setError(result.error)
    } catch {
      // The action threw before producing a result — a misconfigured or
      // unreachable server, not bad credentials. Without this catch the
      // button would stay on "Giriş yapılıyor…" forever.
      setError('Sunucu hatası: giriş şu anda yapılamıyor. Lütfen daha sonra tekrar deneyin.')
    }
    setPending(false)
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <h1 className={styles.title}>Giriş yap</h1>
      <p className={styles.lead}>Nove Performans Yönetim Sistemi</p>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="email">E-posta</label>
        <input
          id="email"
          className={styles.input}
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="password">Parola</label>
        <input
          id="password"
          className={styles.input}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>

      {error ? <p className={styles.error} role="alert">{error}</p> : null}

      <button className={styles.submit} type="submit" disabled={pending}>
        {pending ? 'Giriş yapılıyor…' : 'Giriş yap'}
      </button>

      {showSeedHint ? (
        <p className={styles.hint}>
          Tohum hesapların parolası <code>npm run seed</code> çıktısında bir kez
          gösterilir. Kaybettiyseniz <code>npm run set-password</code> ile
          yenisini belirleyin.
          <br />
          Bu kutu yalnızca geliştirme ortamında görünür.
        </p>
      ) : null}
    </form>
  )
}
