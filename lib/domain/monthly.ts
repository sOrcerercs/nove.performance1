/**
 * Month arithmetic and the rollup rules that collapse monthly entries into a
 * single period figure.
 *
 * Dates and months are ISO strings (`YYYY-MM-DD`, `YYYY-MM`) throughout, never
 * `Date` objects: both shapes sort lexicographically, so every comparison here
 * is a plain string comparison. Building `Date`s to compare months would work
 * too, but it invites timezone bugs that string comparison cannot have.
 */

import type { DateRange } from './dates'
import type { RollupRule } from './types'

/** One month's worth of data for a key result. */
export interface MonthlyValue {
  month: string
  value: number
}

/**
 * Every month a range touches, in order.
 *
 * Data is entered per calendar month, so a range that only clips a month —
 * 12 March to 20 May — still needs that month's figure. Slicing to whole
 * months would silently drop March and May's data from any rollup.
 */
export function monthsInRange(range: DateRange): string[] {
  const [fromYear, fromMonth] = range.from.split('-').map(Number) as [number, number, number]
  const last = range.to.slice(0, 7)

  const months: string[] = []
  for (let offset = 0; ; offset++) {
    // `Date.UTC` absorbs the month overflow (index 12 becomes next January),
    // the same trick the fiscal helpers rely on, so December to January needs
    // no special case here either.
    const month = new Date(Date.UTC(fromYear, fromMonth - 1 + offset, 1)).toISOString().slice(0, 7)
    // A reversed range (`from` after `to`) makes the very first candidate
    // month already later than `last`, so the loop exits with no months
    // rather than looping forever or guessing at the caller's intent —
    // deliberate, and pinned by a test below.
    if (month > last) break
    months.push(month)
  }
  return months
}

/**
 * A period's own months, derived from its start/end dates rather than looked
 * up in a table — so a period edited by hand (not just the standard fiscal
 * year) still produces the right months.
 */
export function monthsOfPeriod(startsOn: string, endsOn: string): string[] {
  return monthsInRange({ from: startsOn, to: endsOn })
}

/**
 * Collapses a key result's filled months into one figure, per its own rule.
 *
 * `avg` divides by the number of *filled* months, not by however many the
 * calendar offers, because three entries out of twelve describe three months
 * of performance, not a twelve-month average dragged toward zero. An empty
 * list means nothing was ever measured, which is `null` — distinct from a
 * measured value of zero. Rounding is deliberately not done here: it is
 * `lib/domain/progress.ts`'s job, and doing it twice would compound error.
 */
export function rollup(rule: RollupRule, values: readonly number[]): number | null {
  if (values.length === 0) return null
  switch (rule) {
    case 'sum':
      return values.reduce((total, v) => total + v, 0)
    case 'avg':
      return values.reduce((total, v) => total + v, 0) / values.length
    case 'last':
      return values[values.length - 1]!
  }
}

/**
 * The value a key result reports for a selected set of months, plus whether
 * it was carried forward from an earlier month.
 *
 * When the selected months have no entries at all, only `last` reaches back
 * for the most recent earlier filled month within the period — a quality
 * score last measured in September is still the last known score in
 * November. `sum` and `avg` describe the selected window itself: carrying a
 * figure into them would report months that were never measured, so they
 * stay `null`. The search for a carried value stops at `periodMonths`'
 * earliest month, never before it, because a closed period's number must not
 * leak into the next one — the caller passes `periodMonths` precisely so this
 * function does not have to (and cannot) guess where that edge is.
 *
 * `latestMonth` reports which month the returned value came from. For `sum`
 * and `avg`, it is the chronologically latest filled month in the range; for
 * `last`, it is both where the value was measured and (if carried) where it
 * was carried from. It is `null` when there is no value to report.
 */
export function valueForRange(
  rule: RollupRule,
  months: readonly string[],
  byMonth: ReadonlyMap<string, number>,
  periodMonths: readonly string[],
): { value: number | null; carriedFrom: string | null; latestMonth: string | null } {
  // Callers pass the months their range touches, and nothing in the type
  // system says those arrive in order. `last` means the chronologically
  // latest month, not whatever the caller happened to put last — and the
  // carry cutoff below depends on the same ordering, so sort once here
  // rather than trusting it.
  const ordered = [...months].sort()

  const filledMonths = ordered.filter((m) => byMonth.has(m))
  const filled = filledMonths.map((m) => byMonth.get(m)!)
  const value = rollup(rule, filled)
  if (value !== null) {
    // The last *filled* month, not the last month asked for: a gap at the end
    // of the window must not be reported as the month the figure came from.
    return { value, carriedFrom: null, latestMonth: filledMonths[filledMonths.length - 1]! }
  }
  if (rule !== 'last') return { value: null, carriedFrom: null, latestMonth: null }

  const rangeStart = ordered[0]
  if (rangeStart === undefined) return { value: null, carriedFrom: null, latestMonth: null }

  for (let i = periodMonths.length - 1; i >= 0; i--) {
    const candidate = periodMonths[i]!
    if (candidate >= rangeStart) continue // still inside (or after) the selected range
    const carried = byMonth.get(candidate)
    // A carried figure's month is both where it was carried from and the month
    // it was measured in — the same answer to two different questions.
    if (carried !== undefined) {
      return { value: carried, carriedFrom: candidate, latestMonth: candidate }
    }
  }
  return { value: null, carriedFrom: null, latestMonth: null }
}
