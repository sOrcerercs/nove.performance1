/**
 * Every server action returns this instead of throwing.
 *
 * A thrown error in a server action reaches the client as an opaque "An error
 * occurred in the Server Components render" — useless for showing the user why
 * their input was rejected. Returning a result makes failure a normal,
 * typed path that the form can render.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string }

export const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data })
export const fail = <T = undefined>(error: string): ActionResult<T> => ({ ok: false, error })

/** Shown when `can()` says no. Deliberately does not reveal what exists. */
export const FORBIDDEN = 'Bu işlem için yetkiniz yok.'
