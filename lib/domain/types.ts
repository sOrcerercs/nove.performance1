export type Lang = 'tr' | 'en'

export type Confidence = 'high' | 'mid' | 'low'

/**
 * Scoring bands, highest first. `above` = Beklenenin Üzerinde, `expected` =
 * Beklenen, `below` = Beklenenin Altında, `open` = Gelişime Açık, `none` =
 * Başlamadı. See `statusOf` for the ranges.
 */
export type StatusKey = 'above' | 'expected' | 'below' | 'open' | 'none'

/**
 * Only İK and Yönetim use this system, so there are no department-lead or
 * team-member logins.
 *
 * - `admin`     — İK / Yönetim. Full access, including user management.
 * - `executive` — read-only oversight.
 * - `staff`     — personnel record only. Named as an objective or key-result
 *                 owner, but cannot sign in and holds no password.
 */
export type Role = 'admin' | 'executive' | 'staff'

/** The roles that are allowed to authenticate. `staff` is deliberately absent. */
export const LOGIN_ROLES = ['admin', 'executive'] as const
export type LoginRole = (typeof LOGIN_ROLES)[number]

export const canSignIn = (role: Role): role is LoginRole =>
  role === 'admin' || role === 'executive'

/** OKR cycles come in two granularities; the period picker toggles between them. */
export type PeriodKind = 'quarter' | 'month'

/** The minimum a key result needs to expose for progress to be computable. */
export interface KrLike {
  start: number
  current: number
  target: number
}

export interface Bilingual {
  tr: string
  en: string
}
