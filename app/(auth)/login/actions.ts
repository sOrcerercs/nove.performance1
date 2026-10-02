'use server'

import { eq } from 'drizzle-orm'
import { AuthError } from 'next-auth'
import { signIn } from '@/lib/auth/config'
import { getThrottleState } from '@/lib/auth/throttle'
import { getDb } from '@/lib/db'
import { users } from '@/lib/db/schema'

/**
 * A code, not a sentence: the sign-in screen is bilingual and writes the
 * message in the language the user picked (`login-copy.ts`).
 */
export interface SignInResult {
  ok: boolean
  code: 'ok' | 'invalid' | 'locked'
  /** Attempts left before a lockout; only sent when two or fewer remain. */
  remaining?: number
  /** Minutes until a locked address may try again. */
  retryAfterMinutes?: number
  /** The signed-in user's full name, for the welcome screen. Empty on failure. */
  name: string
}

/**
 * Wraps Auth.js sign-in so the client gets a plain result instead of a thrown
 * redirect. `redirect: false` keeps the navigation decision on the client,
 * which lets the form show an inline error without a full page reload.
 */
export async function signInWithPassword(input: {
  email: string
  password: string
}): Promise<SignInResult> {
  try {
    await signIn('credentials', {
      email: input.email,
      password: input.password,
      redirect: false,
    })
    return { ok: true, code: 'ok', name: await nameOf(input.email) }
  } catch (err) {
    if (!(err instanceof AuthError)) throw err

    // The throttle is enforced inside authorize(); it is read back here only to
    // explain the refusal. Telling a locked-out address that it is locked is
    // safe because unknown addresses are throttled identically. The read is
    // best-effort: if the database flakes here, the sign-in already failed —
    // answer with the generic refusal instead of surfacing a second error.
    try {
      const db = await getDb()
      const state = await getThrottleState(db, input.email)

      if (state.locked) {
        return { ok: false, code: 'locked', retryAfterMinutes: state.retryAfterMinutes, name: '' }
      }

      // Deliberately vague otherwise: distinguishing "no such user" from "wrong
      // password" would let anyone enumerate valid company addresses.
      return {
        ok: false,
        code: 'invalid',
        ...(state.remaining <= 2 ? { remaining: state.remaining } : {}),
        name: '',
      }
    } catch {
      return { ok: false, code: 'invalid', name: '' }
    }
  }
}

/**
 * The welcome screen greets the user by name. Read after a successful sign-in,
 * with the same normalisation `authorize()` applies. Best-effort: a failed read
 * must not turn a successful sign-in into an error, so it falls back to no name.
 */
async function nameOf(email: string): Promise<string> {
  try {
    const db = await getDb()
    const [row] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .limit(1)
    return row?.name ?? ''
  } catch {
    return ''
  }
}
