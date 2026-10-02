import { SEED_OBJECTIVE_PERIOD_ID, SEED_PERIODS } from '@/lib/db/seed-data'
import { monthsOfPeriod } from '@/lib/domain/monthly'

/**
 * Months to write in tests, derived from the period the seed puts its
 * objectives in. The seed follows today's open fiscal year, so a hard-coded
 * month ('2025-09') silently falls out of the key results' period every
 * September and the writes are refused.
 */
const open = SEED_PERIODS.find((p) => p.id === SEED_OBJECTIVE_PERIOD_ID)
if (!open) throw new Error('seed has no open period')

const months = monthsOfPeriod(open.startsOn, open.endsOn)

/** First and second month of the open period, in calendar order. */
export const M1 = months[0] as string
export const M2 = months[1] as string

/** The month just before the open period: outside every seeded key result's period. */
export const OUTSIDE = (() => {
  const [y, m] = M1.split('-').map(Number) as [number, number]
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
})()
