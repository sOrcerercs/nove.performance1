import type { Db } from '@/lib/db'
import { isValidIsoDate, todayInIstanbul, type DateRange } from '@/lib/domain/dates'
import {
  buildPresets,
  matchPreset,
  type PresetKey,
  type PresetOption,
} from '@/lib/domain/range-presets'
import type { PeriodKind } from '@/lib/domain/types'
import { getDefaultRangeStart } from './settings'
import { allPeriods } from './tables'

export interface PeriodOption {
  id: string
  code: string
  kind: PeriodKind
  state: 'active' | 'closed' | 'planned'
  startsOn: string
  endsOn: string
}

export interface RangeSelection {
  /** The range the screen renders, inclusive at both ends. */
  range: DateRange
  /** Periods intersecting the range, oldest first. Possibly empty. */
  periods: PeriodOption[]
  /** The picker's options, with their ranges already resolved. */
  presets: PresetOption[]
  /** Which preset `range` came from, or `custom`. */
  preset: PresetKey
}

/**
 * Periods overlapping a range.
 *
 * Overlap, not containment: a quarter that is still running has not "ended
 * within" the range, and excluding it would hide the work currently in flight —
 * the opposite of what "fiscal year so far" means.
 */
export function periodsInRange(
  periods: readonly PeriodOption[],
  range: DateRange,
): PeriodOption[] {
  return periods
    .filter((p) => p.startsOn <= range.to && p.endsOn >= range.from)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn))
}

/**
 * The period that is open right now.
 *
 * New objectives are written here whatever the filter says, and the check-in
 * list is drawn from it, so it is deliberately independent of the range. The
 * seed creates fiscal years, but a hand-created quarter can be open too — the
 * only thing that matters is `state`.
 */
export function activePeriodOf(periods: readonly PeriodOption[]): PeriodOption | null {
  return periods.find((p) => p.state === 'active') ?? null
}

/** Reads a single string parameter; an array (`?from=a&from=b`) is not a date. */
function param(
  searchParams: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string | undefined {
  const raw = searchParams?.[key]
  return typeof raw === 'string' ? raw : undefined
}

/**
 * Resolves which date range a screen shows.
 *
 * Every input here comes from the query string, so all of it is untrusted. A
 * malformed, reversed or half-given range silently falls back to the default
 * rather than erroring: a stale bookmark must not be able to break the app.
 * That is the same policy the period picker had before ranges existed.
 *
 * `?period=CODE` is the pre-range parameter. It is still honoured — links live
 * in bookmarks and in the help articles — but an explicit range outranks it.
 */
export async function resolveRange(
  db: Db,
  searchParams?: Record<string, string | string[] | undefined>,
  now: Date = new Date(),
): Promise<RangeSelection> {
  const [rows, defaultStart] = await Promise.all([allPeriods(db), getDefaultRangeStart(db)])

  const periods: PeriodOption[] = rows.map((p) => ({
    id: p.id,
    code: p.code,
    kind: p.kind,
    state: p.state,
    startsOn: p.startsOn,
    endsOn: p.endsOn,
  }))

  const today = todayInIstanbul(now)
  const activePeriod = activePeriodOf(periods)
  const presets = buildPresets({
    today,
    defaultStart,
    activePeriod: activePeriod
      ? { from: activePeriod.startsOn, to: activePeriod.endsOn }
      : null,
  })
  // `buildPresets` always puts the fiscal-year preset first.
  const [fyPreset] = presets
  const fallback = (fyPreset as PresetOption).range

  const range = readRange(searchParams, periods) ?? fallback

  return {
    range,
    periods: periodsInRange(periods, range),
    presets,
    preset: matchPreset(range, presets),
  }
}

/**
 * The query string a layout received, as the shape `resolveRange` expects.
 *
 * Returns an empty object for a missing or empty header rather than throwing:
 * if the middleware did not run, the layout must still render with the default
 * range — the same "a stale bookmark cannot break the app" policy `readRange`
 * follows for malformed dates.
 *
 * A duplicated key (`?from=A&from=B`) comes back as an array rather than the
 * last value: for the page, Next's own `searchParams` already gives a
 * duplicated key as `string[]`, and `param()` below rejects anything that
 * isn't a plain string. `Object.fromEntries(new URLSearchParams(...))` would
 * instead silently keep `B` and hand the layout a single valid-looking string
 * — a second way for the layout to resolve a range the page would have
 * rejected for the very same URL, on top of the one this whole mechanism
 * exists to close.
 */
export function searchParamsFromHeader(value: string | null): Record<string, string | string[]> {
  if (!value) return {}
  const params = new URLSearchParams(value)
  const result: Record<string, string | string[]> = {}
  for (const key of new Set(params.keys())) {
    const all = params.getAll(key)
    result[key] = all.length > 1 ? all : all[0]!
  }
  return result
}

/** The requested range, or null when there is not a usable one. */
function readRange(
  searchParams: Record<string, string | string[] | undefined> | undefined,
  periods: readonly PeriodOption[],
): DateRange | null {
  const from = param(searchParams, 'from')
  const to = param(searchParams, 'to')

  if (from && to && isValidIsoDate(from) && isValidIsoDate(to) && from <= to) {
    return { from, to }
  }

  const code = param(searchParams, 'period')
  const period = code ? periods.find((p) => p.code === code) : undefined
  if (period) return { from: period.startsOn, to: period.endsOn }

  return null
}
