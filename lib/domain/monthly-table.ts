import type { RollupRule } from './types'

/**
 * The per-key-result "Aylık Tablo" (Key Results screen under Yönetim): one row
 * per month of the period with target, actual, difference, note and status.
 *
 * There is no stored monthly target — a key result has one yearly target. The
 * monthly figure is derived from the rollup rule, because that rule already
 * says how months add up to the year:
 *   - `avg` / `last`: each month is measured on the yearly scale (a rate, a
 *     score, a completion %), so every month aims at the yearly target itself.
 *   - `sum`: months add up to the year, so the target is spread evenly.
 */
export function monthlyTarget(rule: RollupRule, target: number, monthCount: number): number {
  return rule === 'sum' && monthCount > 0 ? target / monthCount : target
}

export interface MonthlyValue {
  month: string
  value: number
  note: string | null
}

export interface MonthlyRow {
  month: string
  /** Derived from the yearly target and the rule — see monthlyTarget(). */
  monthlyTarget: number
  /** Null when nothing has been entered for the month. A recorded 0 is 0. */
  actual: number | null
  /** actual − monthlyTarget; null when there is no actual. */
  diff: number | null
  /** Whether the month moved the right way; null when there is no actual. */
  onTrack: boolean | null
  note: string | null
  status: 'entered' | 'pending'
}

export function buildMonthlyTable(input: {
  months: readonly string[]
  rule: RollupRule
  start: number
  target: number
  values: readonly MonthlyValue[]
}): MonthlyRow[] {
  const { months, rule, start, target } = input
  const byMonth = new Map(input.values.map((v) => [v.month, v]))
  const perMonth = monthlyTarget(rule, target, months.length)
  // A key result can aim down (cost per lead 1000 → 800): then under target is good.
  const rising = target >= start

  return months.map((month) => {
    const v = byMonth.get(month)
    if (!v) {
      return { month, monthlyTarget: perMonth, actual: null, diff: null, onTrack: null, note: null, status: 'pending' }
    }
    const diff = v.value - perMonth
    return {
      month,
      monthlyTarget: perMonth,
      actual: v.value,
      diff,
      onTrack: rising ? diff >= 0 : diff <= 0,
      note: v.note?.trim() ? v.note : null,
      status: 'entered',
    }
  })
}
