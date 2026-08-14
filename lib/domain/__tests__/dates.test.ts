import { expect, test } from 'vitest'
import { asOfCutoff, isValidIsoDate, todayInIstanbul } from '../dates'

test('today is read in Istanbul time, not UTC', () => {
  // 22:30 UTC on 9 August is already 01:30 on 10 August in Istanbul (UTC+3).
  expect(todayInIstanbul(new Date('2026-08-09T22:30:00Z'))).toBe('2026-08-10')
  // 20:00 UTC is 23:00 the same day.
  expect(todayInIstanbul(new Date('2026-08-09T20:00:00Z'))).toBe('2026-08-09')
})

test('a cutoff in the future is pulled back to today', () => {
  // A range ending on the open period's `endsOn` — the "Bu dönem" preset —
  // while today is still March. Asserting the *whole* returned date, not just
  // that it is `<= to`, is what rules out a clamp that truncated to the month
  // or returned the range end unchanged.
  const now = new Date('2026-03-15T09:00:00Z')
  expect(asOfCutoff('2026-08-31', now)).toBe('2026-03-15')
})

test('a cutoff in the past is left exactly where it is', () => {
  // The whole point of the filter: looking back must still look back.
  const now = new Date('2026-03-15T09:00:00Z')
  expect(asOfCutoff('2025-11-30', now)).toBe('2025-11-30')
})

test('the clamp reads today in Istanbul, not UTC', () => {
  // 22:30 UTC on 9 August is already the 10th in Istanbul, so a range ending
  // on the 10th is not in the future and must survive untouched. A clamp built
  // on `toISOString()` would report the 9th and cut the range short.
  expect(asOfCutoff('2026-08-10', new Date('2026-08-09T22:30:00Z'))).toBe('2026-08-10')
})

test('malformed and impossible dates are rejected', () => {
  expect(isValidIsoDate('2026-08-10')).toBe(true)
  expect(isValidIsoDate('2028-02-29')).toBe(true)
  expect(isValidIsoDate('2026-02-30')).toBe(false)
  expect(isValidIsoDate('2026-13-01')).toBe(false)
  expect(isValidIsoDate('2026-8-10')).toBe(false)
  expect(isValidIsoDate('yarın')).toBe(false)
  expect(isValidIsoDate('')).toBe(false)
})
