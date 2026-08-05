'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import styles from './ui.module.css'

type ToastFn = (message: string) => void

const ToastContext = createContext<ToastFn | null>(null)

/** Matches the prototype's 2600ms auto-dismiss. */
const DISMISS_MS = 2600

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback((msg: string) => {
    if (timer.current) clearTimeout(timer.current)
    setMessage(msg)
    timer.current = setTimeout(() => setMessage(null), DISMISS_MS)
  }, [])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      {message ? (
        <div className={styles.toast} role="status" aria-live="polite">
          {message}
        </div>
      ) : null}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastFn {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside a ToastProvider')
  return ctx
}
