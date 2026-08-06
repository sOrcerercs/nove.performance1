import type { Db } from '@/lib/db'
import type { PeriodKind } from '@/lib/domain/types'
import { allPeriods } from './tables'

export interface PeriodOption {
  id: string
  code: string
  kind: PeriodKind
  state: 'active' | 'closed' | 'planned'
  startsOn: string
  endsOn: string
}

export interface PeriodSelection {
  /** Every period, both granularities, oldest first. */
  all: PeriodOption[]
  /** The period the screen should render. */
  current: PeriodOption
}

/**
 * Resolves which period a screen shows.
 *
 * `requested` comes from the `?period=` query string, so it is untrusted: an
 * unknown or malformed code silently falls back to the active period rather
 * than erroring, which keeps a stale bookmark from breaking the app.
 */
export async function resolvePeriod(
  db: Db,
  requested: string | undefined,
): Promise<PeriodSelection | null> {
  const rows = await allPeriods(db)
  if (rows.length === 0) return null

  const all: PeriodOption[] = rows.map((p) => ({
    id: p.id,
    code: p.code,
    kind: p.kind,
    state: p.state,
    startsOn: p.startsOn,
    endsOn: p.endsOn,
  }))

  const current =
    (requested ? all.find((p) => p.code === requested) : undefined) ??
    all.find((p) => p.kind === 'quarter' && p.state === 'active') ??
    all.find((p) => p.state === 'active') ??
    all[0]

  // `all` is non-empty and every fallback above ends at all[0].
  return { all, current: current as PeriodOption }
}

/** Reads `?period=` out of a Next `searchParams` object. */
export function periodParam(
  searchParams: Record<string, string | string[] | undefined> | undefined,
): string | undefined {
  const raw = searchParams?.period
  return typeof raw === 'string' ? raw : undefined
}
