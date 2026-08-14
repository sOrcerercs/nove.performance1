import type { Db } from '@/lib/db'
import { isValidIsoDate } from '@/lib/domain/dates'
import { allSettings } from './tables'

/** The key the default range start is stored under. */
export const DEFAULT_RANGE_START_KEY = 'default_range_start'

/**
 * Where the default range begins when nothing is configured.
 *
 * The fiscal year starts on 1 September, and the company's first period in this
 * system is FY2025 — so the app opens on "the fiscal year so far".
 */
export const DEFAULT_RANGE_START = '2025-09-01'

/**
 * The configured default range start, or the built-in fallback.
 *
 * A missing row is the normal state of a fresh database, and a malformed one is
 * recoverable, so neither throws: a bad setting must not be able to take every
 * screen down. The admin form validates on the way in; this validates on the
 * way out.
 */
export async function getDefaultRangeStart(db: Db): Promise<string> {
  const rows = await allSettings(db)
  const stored = rows.find((r) => r.key === DEFAULT_RANGE_START_KEY)?.value
  return stored && isValidIsoDate(stored) ? stored : DEFAULT_RANGE_START
}
