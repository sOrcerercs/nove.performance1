/**
 * Pure helpers behind the sign-in screen. Kept out of the component so the
 * timing model and the validation copy can be tested without a DOM.
 */

/**
 * How full the NOVE wordmark is, 0–1. The fill is the real progress of the
 * sign-in: it rises fast while the request is clearly under way, creeps while
 * the server verifies the password, and only completes once the server has
 * answered — it never sits at 100% waiting.
 *
 * `elapsedMs` is time since the fill started; `dtMs` is the frame length.
 */
export function nextProgress(
  prev: number,
  elapsedMs: number,
  dtMs: number,
  serverDone: boolean,
): number {
  if (serverDone) return Math.min(1, prev + dtMs / 450)
  const waiting = Math.min(0.88, 0.72 * (1 - Math.exp(-elapsedMs / 380)) + elapsedMs * 0.00004)
  return Math.max(prev, waiting)
}

export interface CredentialErrors {
  email?: string
  password?: string
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Client-side checks only; the server re-validates everything. */
export function validateCredentials(email: string, password: string): CredentialErrors {
  const errors: CredentialErrors = {}
  const trimmed = email.trim()
  if (!trimmed) errors.email = 'E-posta adresinizi yazın.'
  else if (!EMAIL.test(trimmed))
    errors.email = 'Bu bir e-posta adresi gibi görünmüyor. Örnek: ad.soyad@nove.group'
  if (!password) errors.password = 'Parolanızı yazın.'
  return errors
}

export function firstNameOf(name: string | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? ''
}
