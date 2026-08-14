/**
 * Date primitives for the range filter.
 *
 * Everything here speaks ISO `YYYY-MM-DD` strings, never `Date` objects: dates
 * cross the server/client boundary as props, and a `Date` would neither
 * serialise nor survive the trip with its intended day intact.
 */

/** An inclusive range: both `from` and `to` are part of it. */
export interface DateRange {
  from: string
  to: string
}

/**
 * "Today" as the user experiences it.
 *
 * The server runs in UTC, so `new Date().toISOString()` would report yesterday
 * between midnight and 03:00 Istanbul time — the default range would silently
 * end a day short every night. `en-CA` is used because it formats as
 * `YYYY-MM-DD`, which is exactly the shape the rest of the app stores.
 */
const ISTANBUL = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Istanbul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function todayInIstanbul(now: Date = new Date()): string {
  return ISTANBUL.format(now)
}

const ISO_SHAPE = /^\d{4}-\d{2}-\d{2}$/

/** Last day of a month, found via "day 0 of the next month". */
function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

/**
 * The cutoff a screen reads for a range ending on `to`.
 *
 * "As of a future date" has no meaning distinct from "as of today": nothing can
 * have been measured in a month that has not happened yet. The distinction is
 * not hypothetical — the "Bu dönem" preset sets `to` to the active period's
 * `endsOn`, which is in the future for most of a fiscal year, and the monthly
 * entry screen lists every month of the open period with no upper bound, so a
 * future-month value is reachable. Left unclamped the headline would count a
 * month the trend cannot plot (`buildTrend` bounds itself by today for exactly
 * that reason), breaking the equality between the headline and the trend's last
 * point that the whole cutoff design rests on.
 *
 * Shared rather than repeated at each page so the call sites cannot drift.
 */
export function asOfCutoff(to: string, now: Date = new Date()): string {
  const today = todayInIstanbul(now)
  return to < today ? to : today
}

/** Both well-formed and a real calendar day — `2026-02-30` is neither. */
export function isValidIsoDate(value: string): boolean {
  if (!ISO_SHAPE.test(value)) return false
  const [year, month, day] = value.split('-').map(Number) as [number, number, number]
  if (month < 1 || month > 12) return false
  return day >= 1 && day <= lastDayOfMonth(year, month - 1)
}
