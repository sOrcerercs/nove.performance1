import { expect, test } from 'vitest'
import { FISCAL_START_MONTH, fiscalQuarterRange, fiscalYearOf, fiscalYearRange } from '../fiscal'

test('the fiscal year starts in September', () => {
  expect(FISCAL_START_MONTH).toBe(9)
})

test('a date in September or later belongs to that calendar year', () => {
  expect(fiscalYearOf('2025-09-01')).toBe(2025)
  expect(fiscalYearOf('2025-12-31')).toBe(2025)
})

test('a date before September belongs to the previous fiscal year', () => {
  expect(fiscalYearOf('2026-08-31')).toBe(2025)
  expect(fiscalYearOf('2026-01-01')).toBe(2025)
})

test('quarters run September, December, March, June', () => {
  expect(fiscalQuarterRange(2025, 1)).toEqual({ startsOn: '2025-09-01', endsOn: '2025-11-30' })
  expect(fiscalQuarterRange(2025, 2)).toEqual({ startsOn: '2025-12-01', endsOn: '2026-02-28' })
  expect(fiscalQuarterRange(2025, 3)).toEqual({ startsOn: '2026-03-01', endsOn: '2026-05-31' })
  expect(fiscalQuarterRange(2025, 4)).toEqual({ startsOn: '2026-06-01', endsOn: '2026-08-31' })
})

test('February gets its leap day without a month-length table', () => {
  expect(fiscalQuarterRange(2027, 2).endsOn).toBe('2028-02-29')
})

test('a fiscal year spans September to the following August', () => {
  expect(fiscalYearRange(2025)).toEqual({ startsOn: '2025-09-01', endsOn: '2026-08-31' })
})
