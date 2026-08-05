'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Lang } from '@/lib/domain/types'
import { STR, type StringKey } from '@/lib/i18n/strings'

export type LayoutVariant = 'hero' | 'cockpit' | 'focus'

interface Prefs {
  lang: Lang
  layout: LayoutVariant
  compact: boolean
}

interface PrefsContextValue extends Prefs {
  setLang: (l: Lang) => void
  setLayout: (v: LayoutVariant) => void
  setCompact: (c: boolean) => void
  t: (key: StringKey) => string
}

const STORAGE_KEY = 'nove-pys-prefs'
const DEFAULTS: Prefs = { lang: 'tr', layout: 'hero', compact: false }

const PrefsContext = createContext<PrefsContextValue | null>(null)

function readStored(): Partial<Prefs> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Partial<Prefs>) : {}
  } catch {
    // Private browsing or corrupt JSON — fall back to defaults rather than crash.
    return {}
  }
}

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS)

  // Read from localStorage in an effect, never during render: the server has
  // no localStorage, and reading it while rendering would desync hydration.
  useEffect(() => {
    setPrefs((p) => ({ ...p, ...readStored() }))
  }, [])

  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch }
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // Preference persistence is best-effort; the session still works.
      }
      return next
    })
  }, [])

  const value = useMemo<PrefsContextValue>(
    () => ({
      ...prefs,
      setLang: (lang) => update({ lang }),
      setLayout: (layout) => update({ layout }),
      setCompact: (compact) => update({ compact }),
      t: (key) => STR[prefs.lang][key] ?? STR.tr[key],
    }),
    [prefs, update],
  )

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>
}

export function usePrefs(): PrefsContextValue {
  const ctx = useContext(PrefsContext)
  if (!ctx) throw new Error('usePrefs must be used inside a PrefsProvider')
  return ctx
}
