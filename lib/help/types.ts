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

export const CATEGORY_LABEL: Record<HelpCategory, string> = {
  basics: 'Temel kullanım',
  okr: 'Objective ve Key Result',
  checkin: 'Haftalık check-in',
  periods: 'Dönemler ve mali takvim',
  admin: 'Kullanıcı ve bölüm yönetimi',
  account: 'Hesap ve parola',
  other: 'Diğer',
}

export interface HelpArticle {
  id: string
  category: HelpCategory
  question: string
  answer: string
  /**
   * `builtin` entries ship with the app and are version-controlled; `custom`
   * ones are written by an admin from the help screen. Shown so nobody wonders
   * why one can be edited and the other cannot.
   */
  source: 'builtin' | 'custom'
  /** Only for `custom`: who last touched it. */
  authorName?: string
}
