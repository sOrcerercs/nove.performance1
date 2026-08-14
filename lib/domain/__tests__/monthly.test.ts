import { expect, test } from 'vitest'
import { monthsInRange, monthsOfPeriod, rollup, valueForRange } from '../monthly'

test('a range covers every month it touches, not just whole ones', () => {
  expect(monthsInRange({ from: '2026-03-12', to: '2026-05-20' })).toEqual(['2026-03', '2026-04', '2026-05'])
  expect(monthsInRange({ from: '2026-03-28', to: '2026-04-02' })).toEqual(['2026-03', '2026-04'])
  expect(monthsInRange({ from: '2026-03-15', to: '2026-03-15' })).toEqual(['2026-03'])
})

test('a range spanning a year boundary keeps the months in order', () => {
  expect(monthsInRange({ from: '2025-11-20', to: '2026-02-03' }))
    .toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
})

test('a fiscal year is its twelve months, September first', () => {
  const months = monthsOfPeriod('2025-09-01', '2026-08-31')
  expect(months).toHaveLength(12)
  expect(months[0]).toBe('2025-09')
  expect(months[11]).toBe('2026-08')
})

test('a leap February is still one month, not two', () => {
  expect(monthsOfPeriod('2028-02-01', '2028-02-29')).toEqual(['2028-02'])
})

test('sum adds the filled months and ignores the gaps', () => {
  expect(rollup('sum', [10, 20, 30])).toBe(60)
  expect(rollup('sum', [])).toBeNull()
})

test('avg divides by the filled months only, not by the calendar', () => {
  // Three months entered out of a twelve-month year: the average is over three.
  expect(rollup('avg', [90, 100, 80])).toBe(90)
  expect(rollup('avg', [])).toBeNull()
})

test('last takes the most recent filled month', () => {
  expect(rollup('last', [10, 20, 30])).toBe(30)
  expect(rollup('last', [])).toBeNull()
})

test('a range with no entries carries the last known value forward, but only for last', () => {
  const periodMonths = ['2025-09', '2025-10', '2025-11', '2025-12']
  const byMonth = new Map([['2025-09', 42]])

  // `last`: nothing in Nov–Dec, so September's figure still stands.
  expect(valueForRange('last', ['2025-11', '2025-12'], byMonth, periodMonths))
    .toEqual({ value: 42, carriedFrom: '2025-09', latestMonth: '2025-09' })

  // `sum` and `avg` describe the selected window itself — carrying would be a lie.
  expect(valueForRange('sum', ['2025-11', '2025-12'], byMonth, periodMonths))
    .toEqual({ value: null, carriedFrom: null, latestMonth: null })
  expect(valueForRange('avg', ['2025-11', '2025-12'], byMonth, periodMonths))
    .toEqual({ value: null, carriedFrom: null, latestMonth: null })
})

test('carrying never reaches outside the period', () => {
  const periodMonths = ['2025-09', '2025-10']
  // A value from before the period exists in the map but must not be reached.
  const byMonth = new Map([['2025-08', 99]])
  expect(valueForRange('last', ['2025-10'], byMonth, periodMonths))
    .toEqual({ value: null, carriedFrom: null, latestMonth: null })
})

test('a filled month in the range beats anything carried', () => {
  const periodMonths = ['2025-09', '2025-10', '2025-11']
  const byMonth = new Map([['2025-09', 42], ['2025-11', 7]])
  expect(valueForRange('last', ['2025-10', '2025-11'], byMonth, periodMonths))
    .toEqual({ value: 7, carriedFrom: null, latestMonth: '2025-11' })
})

test('a reversed range (from after to) yields no months — a deliberate, not accidental, empty result', () => {
  expect(monthsInRange({ from: '2026-05-01', to: '2026-03-01' })).toEqual([])
})

test('unordered months give the same answer as ordered months, for every rule', () => {
  const periodMonths = ['2025-10', '2025-11', '2025-12']
  const byMonth = new Map([['2025-10', 10], ['2025-11', 20], ['2025-12', 30]])
  const ordered = ['2025-10', '2025-11', '2025-12']
  const shuffled = ['2025-12', '2025-10', '2025-11']

  for (const rule of ['sum', 'avg', 'last'] as const) {
    expect(valueForRange(rule, shuffled, byMonth, periodMonths))
      .toEqual(valueForRange(rule, ordered, byMonth, periodMonths))
  }
})

test('last picks the chronologically latest filled month, not the array\'s last element', () => {
  const periodMonths = ['2025-10', '2025-11', '2025-12']
  const byMonth = new Map([['2025-10', 10], ['2025-11', 20], ['2025-12', 30]])
  // December is last chronologically but sits in the middle of this array —
  // a naive `values[values.length - 1]` over unsorted input would report
  // November's 20, not December's 30.
  expect(valueForRange('last', ['2025-11', '2025-12', '2025-10'], byMonth, periodMonths))
    .toEqual({ value: 30, carriedFrom: null, latestMonth: '2025-12' })
})

test('a selected range extending past the period end still resolves correctly', () => {
  // The period is a short three-month stub; the user's filter touches one
  // month past its end (the next period has not started entering data yet).
  const periodMonths = ['2026-06', '2026-07', '2026-08']
  const byMonth = new Map([['2026-07', 15]])
  expect(valueForRange('last', ['2026-08', '2026-09'], byMonth, periodMonths))
    .toEqual({ value: 15, carriedFrom: '2026-07', latestMonth: '2026-07' })
  expect(valueForRange('sum', ['2026-08', '2026-09'], byMonth, periodMonths))
    .toEqual({ value: null, carriedFrom: null, latestMonth: null })
})

test('the latest contributing month is reported for every rule', () => {
  const periodMonths = ['2025-09', '2025-10', '2025-11']
  const months = ['2025-09', '2025-10', '2025-11']
  // October is deliberately empty: the latest *contributing* month is November,
  // not the latest month in the list.
  const byMonth = new Map([['2025-09', 10], ['2025-11', 30]])

  expect(valueForRange('sum', months, byMonth, periodMonths).latestMonth).toBe('2025-11')
  expect(valueForRange('avg', months, byMonth, periodMonths).latestMonth).toBe('2025-11')
  expect(valueForRange('last', months, byMonth, periodMonths).latestMonth).toBe('2025-11')
})

test('a gap at the end of the window is not reported as the figure\'s month', () => {
  const periodMonths = ['2025-09', '2025-10', '2025-11']
  const byMonth = new Map([['2025-09', 10]])
  // November is asked for but empty; September is where the number came from.
  expect(valueForRange('sum', periodMonths, byMonth, periodMonths).latestMonth).toBe('2025-09')
})

test('an unordered month list still reports the chronologically latest', () => {
  const byMonth = new Map([['2025-09', 10], ['2025-10', 20]])
  expect(valueForRange('sum', ['2025-10', '2025-09'], byMonth, ['2025-09', '2025-10']).latestMonth)
    .toBe('2025-10')
})

test('a month measured as zero still counts as the latest contributing month', () => {
  // Zero is a measurement, not an absence — `byMonth.has` is what decides.
  const byMonth = new Map([['2025-09', 10], ['2025-10', 0]])
  expect(valueForRange('sum', ['2025-09', '2025-10'], byMonth, ['2025-09', '2025-10']).latestMonth)
    .toBe('2025-10')
})
