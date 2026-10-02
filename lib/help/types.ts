import type { Bilingual, Lang } from '@/lib/domain/types'

export type HelpCategory =
  | 'basics'
  | 'okr'
  | 'checkin'
  | 'periods'
  | 'admin'
  | 'account'
  | 'other'

export const HELP_CATEGORIES: readonly HelpCategory[] = [
  'basics',
  'okr',
  'checkin',
  'periods',
  'admin',
  'account',
  'other',
] as const

export const CATEGORY_LABEL: Record<HelpCategory, Bilingual> = {
  basics: { tr: 'Temel kullanım', en: 'Basics' },
  okr: { tr: 'Objective ve Key Result', en: 'Objectives and key results' },
  checkin: { tr: 'Haftalık check-in', en: 'Weekly check-in' },
  periods: { tr: 'Dönemler ve mali takvim', en: 'Periods and fiscal calendar' },
  admin: { tr: 'Kullanıcı ve bölüm yönetimi', en: 'Users and departments' },
  account: { tr: 'Hesap ve parola', en: 'Account and password' },
  other: { tr: 'Diğer', en: 'Other' },
}

export interface HelpArticle {
  id: string
  category: HelpCategory
  /** Turkish (authoritative) for built-ins; as written for custom entries. */
  question: string
  answer: string
  /**
   * English version, built-ins only. Custom entries are the team's own notes,
   * single-language, and are shown as written whatever the interface language.
   */
  en?: { question: string; answer: string }
  /**
   * `builtin` entries ship with the app and are version-controlled; `custom`
   * ones are written by an admin from the help screen. Shown so nobody wonders
   * why one can be edited and the other cannot.
   */
  source: 'builtin' | 'custom'
  /** Only for `custom`: who last touched it. */
  authorName?: string
}

/** The question and answer to show in `lang`; falls back to the text as stored. */
export function localizeArticle(
  a: HelpArticle,
  lang: Lang,
): { question: string; answer: string } {
  if (lang === 'en' && a.en) return a.en
  return { question: a.question, answer: a.answer }
}
