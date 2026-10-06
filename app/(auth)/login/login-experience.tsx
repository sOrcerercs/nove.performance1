'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Lang } from '@/lib/domain/types'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import { signInWithPassword, type SignInResult } from './actions'
import { COPY, failureMessage, fieldMessage, type SignInFailure } from './login-copy'
import {
  firstNameOf,
  nextProgress,
  validateCredentials,
  type CredentialErrors,
} from './sign-in-progress'
import { paintSphere, type Circle } from './sphere'
import styles from './login.module.css'

/**
 * The sign-in screen (design.md §8 `/login`, §9.3).
 *
 *   login    — scattered words over the brand sphere, credentials card
 *   signing  — words fly off, the sphere shrinks away, NOVE fills with ink from
 *              the bottom up; the fill is the real progress of the request
 *   welcome  — the NOVE dot grows into the sphere, "Hoş geldin, <ad>."
 *   leaving  — scrolling down sends the words and the sphere up and opens the
 *              current home page
 *
 * Everything per-frame (canvas, fill, sphere clip) is written to the DOM from
 * refs inside one animation loop; React state only changes between phases.
 */

type Phase = 'login' | 'signing' | 'welcome' | 'leaving'
type Stop = 'login' | 'welcome'

const STOPS: Record<Stop, [number, number, number]> = {
  login: [0.6, 0.5, 0.36],
  welcome: [0.62, 0.5, 0.34],
}

const HOME = '/'
const TIMEOUT_MS = 20_000

interface Tween {
  from: Circle
  to?: Circle
  t0: number
  ms: number
  ease: (k: number) => number
  done?: () => void
}

const outQuart = (k: number) => 1 - Math.pow(1 - k, 4)
const inCubic = (k: number) => k * k * k

// Deterministic per-letter "randomness": the same on server and client, so the
// split headline hydrates cleanly.
const rand = (i: number, salt: number) => {
  const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453
  return v - Math.floor(v)
}

interface Line {
  text: string
  /** CSS-module class; typed `string | undefined` under noUncheckedIndexedAccess. */
  className?: string
}

/** One headline, split into masked letters that rise in a shuffled order. */
function SplitLines({ lines, delay = 0 }: { lines: Line[]; delay?: number }) {
  let i = 0
  return (
    <>
      {lines.map((line) => (
        <span key={line.text} className={`${styles.word} ${line.className ?? ''}`}>
          {line.text.split(' ').map((word, w) => (
            <span key={w}>
              {w > 0 ? ' ' : null}
              <span className={styles.nowrap}>
                {[...word].map((ch) => {
                  const n = i++
                  const style = {
                    '--r': rand(n, 1).toFixed(3),
                    '--dx': (rand(n, 2) * 2 - 1).toFixed(3),
                  } as CSSProperties
                  return (
                    <span key={n} className={styles.split} style={style} aria-hidden="true">
                      <span style={{ animationDelay: `${delay + Math.round(rand(n, 3) * 520)}ms` }}>
                        {ch}
                      </span>
                    </span>
                  )
                })}
              </span>
            </span>
          ))}
        </span>
      ))}
    </>
  )
}

/**
 * The headline twice: ink underneath, white on top. The white copy is clipped
 * to the sphere every frame, so letters turn white exactly at its edge.
 */
function Title({
  label,
  lines,
  dispersed,
  twinRef,
  delay,
}: {
  label: string
  lines: Line[]
  dispersed: boolean
  twinRef: React.RefObject<HTMLDivElement | null>
  delay?: number
}) {
  return (
    <div className={`${styles.title} ${dispersed ? styles.dispersed : ''}`}>
      <h1 className={styles.titleGrid} aria-label={label}>
        <SplitLines lines={lines} delay={delay} />
      </h1>
      <div ref={twinRef} className={`${styles.titleGrid} ${styles.twin}`} aria-hidden="true">
        <SplitLines lines={lines} delay={delay} />
      </div>
    </div>
  )
}

/**
 * TR | EN slide switch. Two radios rather than one on/off switch, because
 * neither language is "off". Writes the shared app preference, so the choice
 * made here carries into the app after sign-in.
 */
function LanguageSwitch({ lang, onChange, label }: { lang: Lang; onChange: (l: Lang) => void; label: string }) {
  const options: { value: Lang; text: string; name: string }[] = [
    { value: 'tr', text: 'TR', name: 'Türkçe' },
    { value: 'en', text: 'EN', name: 'English' },
  ]
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault()
      const next: Lang = lang === 'tr' ? 'en' : 'tr'
      onChange(next)
      ;(e.currentTarget.querySelector(`[data-lang="${next}"]`) as HTMLElement | null)?.focus()
    }
  }
  return (
    <div
      className={`${styles.langSwitch} ${lang === 'en' ? styles.langEn : ''}`}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      <span className={styles.langKnob} aria-hidden="true" />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          data-lang={o.value}
          aria-checked={lang === o.value}
          aria-label={o.name}
          tabIndex={lang === o.value ? 0 : -1}
          className={styles.langOption}
          onClick={() => onChange(o.value)}
        >
          {o.text}
        </button>
      ))}
    </div>
  )
}

/** Renders `code` spans for text wrapped in backticks. */
function withCode(text: string) {
  return text.split('`').map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part))
}

interface Failure {
  code: SignInFailure
  remaining?: number
  retryAfterMinutes?: number
}

export function LoginExperience({
  showSeedHint,
  welcomeName,
}: {
  showSeedHint: boolean
  /** When set, the screen opens straight on the welcome phase for this
   * already signed-in user (the sidebar's "Anasayfa" link, `/hosgeldin`). */
  welcomeName?: string
}) {
  const router = useRouter()
  const { lang, setLang } = usePrefs()
  const c = COPY[lang]
  const startsWelcome = welcomeName !== undefined

  const [phase, setPhase] = useState<Phase>(startsWelcome ? 'welcome' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<CredentialErrors>({})
  const [failure, setFailure] = useState<Failure | null>(null)
  const [name, setName] = useState(welcomeName ?? '')
  const [loginRun, setLoginRun] = useState(0)
  const [fillOn, setFillOn] = useState(false)
  const [fillHandoff, setFillHandoff] = useState(false)
  const [dot, setDot] = useState<'empty' | 'ink' | 'lit'>('empty')
  const [progressLabel, setProgressLabel] = useState<'submitting' | 'welcome'>('submitting')

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const loginTwin = useRef<HTMLDivElement>(null)
  const welcomeTwin = useRef<HTMLDivElement>(null)
  const inkRef = useRef<HTMLSpanElement>(null)
  const pctRef = useRef<HTMLSpanElement>(null)
  const dotRef = useRef<HTMLSpanElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  const sphere = useRef<Circle>({ x: 0, y: 0, r: 0 })
  const stop = useRef<Stop>(startsWelcome ? 'welcome' : 'login')
  const tween = useRef<Tween | null>(null)
  const sphereHidden = useRef(false)
  const size = useRef({ w: 0, h: 0 })
  const reduced = useRef(false)
  const serverDone = useRef(false)
  const aborted = useRef(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms))
  }

  const goal = useCallback((): Circle => {
    const { w, h } = size.current
    let [fx, fy, fr] = STOPS[stop.current]
    if (w < 860) {
      fx = 0.5
      fy = 0.62
      fr *= 0.9
    }
    return { x: fx * w, y: fy * h, r: fr * Math.min(h, w * 1.15) }
  }, [])

  // ---------- the one animation loop: sphere, twin clips ----------
  useEffect(() => {
    reduced.current = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const canvas = canvasRef.current
    const cx = canvas?.getContext('2d') ?? null
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)

    const resize = () => {
      size.current = { w: window.innerWidth, h: window.innerHeight }
      if (canvas && cx) {
        canvas.width = Math.round(size.current.w * dpr)
        canvas.height = Math.round(size.current.h * dpr)
        cx.setTransform(dpr, 0, 0, dpr, 0, 0)
      }
    }
    resize()
    // The sphere grows in from nothing on first paint.
    const g = goal()
    sphere.current = { ...g, r: 0 }
    tween.current = reduced.current
      ? null
      : { from: { ...g, r: 0 }, t0: performance.now(), ms: 1100, ease: outQuart }
    if (reduced.current) sphere.current = g

    let raf = 0
    const frame = (t: number) => {
      const to = goal()
      const tw = tween.current
      const s = sphere.current
      if (tw) {
        const k = Math.min(1, Math.max(0, (t - tw.t0) / tw.ms))
        const e = tw.ease(k)
        const dest = tw.to ?? to
        s.x = tw.from.x + (dest.x - tw.from.x) * e
        s.y = tw.from.y + (dest.y - tw.from.y) * e
        s.r = tw.from.r + (dest.r - tw.from.r) * e
        if (k >= 1) {
          tween.current = null
          tw.done?.()
        }
      } else if (!sphereHidden.current) {
        const f = reduced.current ? 1 : 0.1
        s.x += (to.x - s.x) * f
        s.y += (to.y - s.y) * f
        s.r += (to.r - s.r) * f
      }

      if (cx) {
        cx.clearRect(0, 0, size.current.w, size.current.h)
        if (!sphereHidden.current) paintSphere(cx, s, reduced.current ? 0 : t)
      }

      for (const twin of [loginTwin.current, welcomeTwin.current]) {
        if (!twin) continue
        const b = twin.getBoundingClientRect()
        twin.style.clipPath = sphereHidden.current
          ? 'circle(0 at -100px -100px)'
          : `circle(${s.r}px at ${s.x - b.left}px ${s.y - b.top}px)`
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    window.addEventListener('resize', resize)
    if (stop.current === 'welcome') router.prefetch(HOME)
    const pending = timers
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      // Read at unmount on purpose: abortSigning() replaces the array.
      pending.current.forEach(clearTimeout)
    }
  }, [goal, router])

  // ---------- NOVE fill: the progress of the real request ----------
  const enterWelcome = useCallback(() => {
    stop.current = 'welcome'
    const d = dotRef.current?.getBoundingClientRect()
    if (d && !reduced.current) {
      const from = { x: d.left + d.width / 2, y: d.top + d.height / 2, r: d.width / 2 }
      sphere.current = { ...from }
      tween.current = { from, t0: performance.now(), ms: 1300, ease: outQuart }
    } else {
      tween.current = null
      sphere.current = goal()
    }
    sphereHidden.current = false
    setPhase('welcome')
    setFillHandoff(true)
    later(() => setFillOn(false), 400)
    router.prefetch(HOME)
  }, [goal, router])

  const runFill = useCallback(() => {
    let p = 0
    let start: number | null = null
    let last = 0
    const step = (now: number) => {
      if (aborted.current) return
      if (start === null) {
        start = now
        last = now
      }
      p = nextProgress(p, now - start, now - last, serverDone.current)
      last = now
      if (inkRef.current) inkRef.current.style.clipPath = `inset(${(1 - p) * 100}% 0 0 0)`
      if (pctRef.current) pctRef.current.textContent = String(Math.round(p * 100)).padStart(2, '0')
      if (p < 1) {
        requestAnimationFrame(step)
        return
      }
      setProgressLabel('welcome')
      setDot('ink')
      later(() => setDot('lit'), 260)
      later(enterWelcome, 620)
    }
    requestAnimationFrame(step)
  }, [enterWelcome])

  function startSigning() {
    serverDone.current = false
    aborted.current = false
    setDot('empty')
    setProgressLabel('submitting')
    setFillHandoff(false)
    if (inkRef.current) inkRef.current.style.clipPath = 'inset(100% 0 0 0)'
    if (pctRef.current) pctRef.current.textContent = '00'
    setPhase('signing')

    if (reduced.current) {
      setFillOn(true)
      return
    }
    // The sphere falls into itself while the words fly off.
    tween.current = {
      from: { ...sphere.current },
      to: { ...sphere.current, r: 0 },
      t0: performance.now(),
      ms: 700,
      ease: inCubic,
      done: () => {
        sphereHidden.current = true
      },
    }
    later(() => setFillOn(true), 350)
    later(runFill, 450)
  }

  function abortSigning(f: Failure) {
    aborted.current = true
    timers.current.forEach(clearTimeout)
    timers.current = []
    setFillOn(false)
    setFailure(f)
    setPhase('login')
    setLoginRun((n) => n + 1)
    stop.current = 'login'
    sphereHidden.current = false
    const g = goal()
    sphere.current = { ...g, r: 0 }
    tween.current = reduced.current
      ? null
      : { from: { ...g, r: 0 }, t0: performance.now(), ms: 900, ease: outQuart }
    later(() => passwordRef.current?.focus(), 50)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (phase !== 'login') return
    const errors = validateCredentials(email, password)
    setFieldErrors(errors)
    if (errors.email || errors.password) {
      ;(errors.email ? emailRef : passwordRef).current?.focus()
      return
    }
    setFailure(null)
    startSigning()

    let result: SignInResult | (Failure & { ok: false; name: '' })
    try {
      // The action can stall when the database connection hangs server-side;
      // racing a timeout guarantees the fill never waits forever.
      result = await Promise.race([
        signInWithPassword({ email: email.trim(), password }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)),
      ])
    } catch {
      result = { ok: false, code: 'unreachable', name: '' }
    }

    if (!result.ok) {
      abortSigning({
        code: result.code as SignInFailure,
        remaining: result.remaining,
        retryAfterMinutes: result.retryAfterMinutes,
      })
      return
    }
    // The welcome screen can stay open for a while; do not keep the password
    // in memory once it has done its job.
    setPassword('')
    setName(result.name)
    if (reduced.current) {
      if (inkRef.current) inkRef.current.style.clipPath = 'inset(0 0 0 0)'
      if (pctRef.current) pctRef.current.textContent = '100'
      setDot('lit')
      later(enterWelcome, 300)
      return
    }
    serverDone.current = true
  }

  // ---------- welcome: scroll down to open the home page ----------
  const leave = useCallback(() => {
    setPhase('leaving')
    if (reduced.current) {
      router.replace(HOME)
      router.refresh()
      return
    }
    const s = sphere.current
    tween.current = {
      from: { ...s },
      to: { x: s.x, y: -s.r * 1.4, r: s.r * 0.85 },
      t0: performance.now(),
      ms: 900,
      ease: inCubic,
      done: () => {
        sphereHidden.current = true
      },
    }
    later(() => {
      // Full refresh so the server layout re-reads the new session cookie.
      router.replace(HOME)
      router.refresh()
    }, 650)
  }, [router])

  useEffect(() => {
    if (phase !== 'welcome') return
    // Ignore the tail of the gesture that may still be scrolling when the
    // welcome screen appears.
    const armedAt = performance.now() + 600
    let wheel = 0
    let touchY: number | null = null
    let gone = false
    const go = () => {
      if (gone || performance.now() < armedAt) return
      gone = true
      leave()
    }
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY <= 0) return
      wheel += e.deltaY
      if (wheel > 40) go()
    }
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0]?.clientY ?? null
    }
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY
      if (touchY !== null && y !== undefined && touchY - y > 40) go()
    }
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) {
        e.preventDefault()
        go()
      }
    }
    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('keydown', onKey)
    }
  }, [phase, leave])

  const first = firstNameOf(name)
  const welcomeLines: Line[] = first
    ? [
        { text: `${c.welcome},`, className: styles.w1 },
        { text: `${first}.`, className: styles.w2 },
      ]
    : [{ text: `${c.welcome}.`, className: styles.w1 }]

  const inLogin = phase === 'login' || phase === 'signing'

  return (
    // `lang` on the root matters: Turkish case rules would uppercase the
    // English "i" in SIGN IN as "İ".
    <div className={styles.root} lang={lang}>
      <canvas ref={canvasRef} className={styles.sky} aria-hidden="true" />

      {inLogin ? (
        <section className={styles.screen} aria-label={c.signInRegion}>
          <span className={styles.wordmark}>Nove PYS.</span>
          <div className={styles.corner}>
            <LanguageSwitch lang={lang} onChange={setLang} label={c.language} />
          </div>
          <Title
            key={`${loginRun}-${lang}`}
            label={c.headlineLabel}
            lines={[
              { text: c.headline[0], className: styles.w1 },
              { text: c.headline[1], className: styles.w2 },
              { text: c.headline[2], className: styles.w3 },
            ]}
            dispersed={phase === 'signing'}
            twinRef={loginTwin}
          />
          <div className={styles.meta}>
            <span className={styles.label}>{c.group}</span>
            <span className={`${styles.label} ${styles.muted}`}>{c.system}</span>
          </div>

          <form
            className={`${styles.card} ${phase === 'signing' ? styles.cardLeaving : ''}`}
            onSubmit={onSubmit}
            noValidate
          >
            <div className={styles.field}>
              <label className={styles.label} htmlFor="email">{c.email}</label>
              <input
                ref={emailRef}
                id="email"
                className={styles.input}
                type="email"
                autoComplete="username"
                placeholder={c.emailPlaceholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={fieldErrors.email ? true : undefined}
                aria-describedby={fieldErrors.email ? 'email-error' : undefined}
                disabled={phase !== 'login'}
              />
              {fieldErrors.email ? (
                <span id="email-error" className={styles.fieldError}>
                  {fieldMessage('email', fieldErrors.email, lang)}
                </span>
              ) : null}
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="password">{c.password}</label>
              <input
                ref={passwordRef}
                id="password"
                className={styles.input}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={fieldErrors.password ? true : undefined}
                aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                disabled={phase !== 'login'}
              />
              {fieldErrors.password ? (
                <span id="password-error" className={styles.fieldError}>
                  {fieldMessage('password', fieldErrors.password, lang)}
                </span>
              ) : null}
              <p className={styles.forgot}>{c.forgot}</p>
            </div>

            {failure ? (
              <p className={styles.error} role="alert">
                {failureMessage(failure.code, lang, failure)}
              </p>
            ) : null}

            <button className={styles.submit} type="submit" disabled={phase !== 'login'}>
              <span>{phase === 'login' ? c.submit : c.submitting}</span>
              <span aria-hidden="true">→</span>
            </button>

            {showSeedHint ? (
              <p className={styles.hint}>{withCode(c.seedHint)}</p>
            ) : null}
          </form>
        </section>
      ) : (
        <section className={styles.screen} aria-label={c.welcomeRegion}>
          <span className={styles.wordmark}>Nove PYS.</span>
          {name ? <span className={`${styles.label} ${styles.corner}`}>{name}</span> : null}
          <Title
            key={lang}
            label={first ? `${c.welcome}, ${first}.` : `${c.welcome}.`}
            lines={welcomeLines}
            dispersed={phase === 'leaving'}
            twinRef={welcomeTwin}
            delay={250}
          />
          <div className={styles.meta}>
            <span className={styles.label}>{c.home}</span>
            <span className={`${styles.label} ${styles.muted}`}>{c.scrollHint}</span>
          </div>
          <button
            type="button"
            className={`${styles.label} ${styles.scroll}`}
            onClick={leave}
            disabled={phase === 'leaving'}
          >
            {c.scroll}
          </button>
        </section>
      )}

      <div
        className={`${styles.fill} ${fillOn ? styles.fillOn : ''} ${fillHandoff ? styles.fillHandoff : ''}`}
      >
        <div className={styles.mark} aria-hidden="true">
          <span className={styles.letters}>
            <span className={styles.ghostFill}>NOVE</span>
            <span ref={inkRef} className={styles.inkFill}>NOVE</span>
          </span>
          <span
            ref={dotRef}
            className={`${styles.dot} ${dot === 'ink' ? styles.dotInk : ''} ${dot === 'lit' ? styles.dotLit : ''}`}
          />
        </div>
        <span className={styles.srOnly} role="status">
          {phase === 'signing' ? c.submitting : ''}
        </span>
        <div className={`${styles.label} ${styles.progress}`} aria-hidden="true">
          <span>{fillOn ? c[progressLabel] : ''}</span>
          <span ref={pctRef} className={styles.muted}>00</span>
        </div>
      </div>
    </div>
  )
}
