import { describe, expect, test } from 'vitest'
import { buildMonthlyTable, monthlyTarget } from '../monthly-table'

const MONTHS = ['2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02',
  '2027-03', '2027-04', '2027-05', '2027-06', '2027-07', '2027-08']

describe('monthlyTarget', () => {
  test('average and last: every month aims at the yearly target itself', () => {
    expect(monthlyTarget('avg', 1.5, 12)).toBe(1.5)
    expect(monthlyTarget('last', 100, 12)).toBe(100)
  })

  test('sum: the yearly target spread evenly over the period', () => {
    expect(monthlyTarget('sum', 750, 12)).toBe(62.5)
  })
})

describe('buildMonthlyTable', () => {
  const base = { months: MONTHS, rule: 'avg' as const, start: 0, target: 1.5 }

  test('one row per month of the period, in order, entered or pending', () => {
    const rows = buildMonthlyTable({
      ...base,
      values: [
        { month: '2026-10', value: 1.6, note: null },
        { month: '2026-09', value: 1.8, note: 'kampanya ayı' },
      ],
    })
    expect(rows.map((r) => r.month)).toEqual(MONTHS)
    expect(rows[0]).toMatchObject({ target: 1.5, actual: 1.8, status: 'entered', note: 'kampanya ayı' })
    expect(rows[0]!.diff).toBeCloseTo(0.3)
    expect(rows[1]!.diff).toBeCloseTo(0.1)
    expect(rows[2]).toMatchObject({ actual: null, diff: null, status: 'pending', note: null })
  })

  test('a recorded zero is entered, not pending', () => {
    const [row] = buildMonthlyTable({ ...base, values: [{ month: '2026-09', value: 0, note: null }] })
    expect(row).toMatchObject({ actual: 0, status: 'entered' })
    expect(row!.diff).toBeCloseTo(-1.5)
  })

  test('the difference is judged by the direction the key result is meant to move', () => {
    // Rising target: above target is good.
    const up = buildMonthlyTable({ ...base, values: [{ month: '2026-09', value: 1.4, note: null }] })
    expect(up[0]!.onTrack).toBe(false)

    // Falling target (cost per lead 1000 → 800): below target is good.
    const down = buildMonthlyTable({
      months: MONTHS, rule: 'last', start: 1000, target: 800,
      values: [{ month: '2026-09', value: 780, note: null }, { month: '2026-10', value: 900, note: null }],
    })
    expect(down[0]!.onTrack).toBe(true)
    expect(down[1]!.onTrack).toBe(false)
    expect(down[2]!.onTrack).toBeNull()
  })

  test('months outside the period are ignored', () => {
    const rows = buildMonthlyTable({ ...base, values: [{ month: '2025-08', value: 9, note: null }] })
    expect(rows.every((r) => r.status === 'pending')).toBe(true)
  })
})
