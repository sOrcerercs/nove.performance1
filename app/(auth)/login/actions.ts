'use server'

import { eq } from 'drizzle-orm'
import { AuthError } from 'next-auth'
import { signIn } from '@/lib/auth/config'
import { getThrottleState } from '@/lib/auth/throttle'
import { getDb } from '@/lib/db'
import { users } from '@/lib/db/schema'

export interface SignInResult {
  ok: boolean
  error: string
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
    return { ok: true, error: '', name: await nameOf(input.email) }
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
        return {
          ok: false,
          error: `Çok fazla başarısız deneme. ${state.retryAfterMinutes} dakika sonra tekrar dene.`,
          name: '',
        }
      }

      // Deliberately vague otherwise: distinguishing "no such user" from "wrong
      // password" would let anyone enumerate valid company addresses.
      const suffix =
        state.remaining <= 2 ? ` ${state.remaining} deneme hakkın kaldı.` : ''

      return { ok: false, error: `E-posta veya parola hatalı.${suffix}`, name: '' }
    } catch {
      return { ok: false, error: 'E-posta veya parola hatalı.', name: '' }
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
