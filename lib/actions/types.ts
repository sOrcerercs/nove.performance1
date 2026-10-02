/**
 * Every server action returns this instead of throwing.
 *
 * A thrown error in a server action reaches the client as an opaque "An error
 * occurred in the Server Components render" — useless for showing the user why
 * their input was rejected. Returning a result makes failure a normal,
 * typed path that the form can render.
 */
import type { Bilingual } from '@/lib/domain/types'

/*
 * The error carries both languages. The interface is bilingual and the
 * language lives in the browser, so the server cannot know which one to send;
 * the client shows `tx(result.error, lang)`.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: Bilingual }

export const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data })
export const fail = <T = undefined>(error: Bilingual): ActionResult<T> => ({ ok: false, error })

/** A bilingual message. */
export const msg = (tr: string, en: string): Bilingual => ({ tr, en })

/** Shown when `can()` says no. Deliberately does not reveal what exists. */
export const FORBIDDEN = msg('Bu işlem için yetkiniz yok.', "You don't have permission to do this.")

/** The fallback for a validation failure the module has no wording for. */
export const INVALID_INPUT = msg('Girdi geçersiz.', 'Invalid input.')

/**
 * Zod messages must be plain strings, so schemas carry the Turkish text of a
 * bilingual catalog entry. This maps a zod issue's message back to its entry
 * (matched on `.tr`), or to `fallback` when nothing matches.
 */
export const fromIssue = (
  message: string | undefined,
  catalog: Record<string, Bilingual>,
  fallback: Bilingual = INVALID_INPUT,
): Bilingual => {
  if (message === undefined) return fallback
  return Object.values(catalog).find((m) => m.tr === message) ?? fallback
}
