import { eq } from 'drizzle-orm'
import type { Db } from '@/lib/db'
import { loginAttempts } from '@/lib/db/schema'

/** Failures tolerated inside one window before the address is locked. */
export const MAX_FAILURES = 5
/** Failures older than this stop counting. */
export const WINDOW_MS = 15 * 60 * 1000
/** How long a locked address stays locked. */
export const LOCK_MS = 15 * 60 * 1000

export interface ThrottleState {
  locked: boolean
  /** Attempts left before locking. 0 once locked. */
  remaining: number
  /** Whole minutes until the lock lifts, rounded up. 0 when not locked. */
  retryAfterMinutes: number
}

const normalise = (email: string): string => email.trim().toLowerCase()

const minutesUntil = (until: Date, now: Date): number =>
  Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 60_000))

/**
 * Current throttle state for an email, without recording anything.
 *
 * `now` is injectable so the tests can exercise window expiry without sleeping.
 */
export async function getThrottleState(
  db: Db,
  email: string,
  now: Date = new Date(),
): Promise<ThrottleState> {
  const key = normalise(email)
  const [row] = await db.select().from(loginAttempts).where(eq(loginAttempts.key, key)).limit(1)

  if (!row) return { locked: false, remaining: MAX_FAILURES, retryAfterMinutes: 0 }

  if (row.lockedUntil && row.lockedUntil.getTime() > now.getTime()) {
    return {
      locked: true,
      remaining: 0,
      retryAfterMinutes: minutesUntil(row.lockedUntil, now),
    }
  }

  // The lock expired, or the counting window rolled over.
  const windowExpired = now.getTime() - row.firstFailedAt.getTime() > WINDOW_MS
  if (row.lockedUntil || windowExpired) {
    return { locked: false, remaining: MAX_FAILURES, retryAfterMinutes: 0 }
  }

  return {
    locked: false,
    remaining: Math.max(0, MAX_FAILURES - row.failedCount),
    retryAfterMinutes: 0,
  }
}

/**
 * Records one failed attempt and returns the resulting state.
 *
 * Called for every rejected sign-in, including ones for addresses that do not
 * exist, so that lockout behaviour cannot be used to enumerate accounts.
 */
export async function recordFailure(
  db: Db,
  email: string,
  now: Date = new Date(),
): Promise<ThrottleState> {
  const key = normalise(email)
  const [row] = await db.select().from(loginAttempts).where(eq(loginAttempts.key, key)).limit(1)

  const lockExpired = !row?.lockedUntil || row.lockedUntil.getTime() <= now.getTime()
  const windowExpired = !row || now.getTime() - row.firstFailedAt.getTime() > WINDOW_MS
  const startFresh = !row || windowExpired || (row.lockedUntil !== null && lockExpired)

  const failedCount = startFresh ? 1 : row.failedCount + 1
  const shouldLock = failedCount >= MAX_FAILURES
  const lockedUntil = shouldLock ? new Date(now.getTime() + LOCK_MS) : null
  const firstFailedAt = startFresh ? now : row.firstFailedAt

  if (row) {
    await db
      .update(loginAttempts)
      .set({ failedCount, firstFailedAt, lockedUntil })
      .where(eq(loginAttempts.key, key))
  } else {
    await db.insert(loginAttempts).values({ key, failedCount, firstFailedAt, lockedUntil })
  }

  if (shouldLock && lockedUntil) {
    return { locked: true, remaining: 0, retryAfterMinutes: minutesUntil(lockedUntil, now) }
  }
  return { locked: false, remaining: MAX_FAILURES - failedCount, retryAfterMinutes: 0 }
}

/** Clears the counter after a successful sign-in. */
export async function clearFailures(db: Db, email: string): Promise<void> {
  await db.delete(loginAttempts).where(eq(loginAttempts.key, normalise(email)))
}
