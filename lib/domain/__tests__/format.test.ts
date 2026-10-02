import { expect, test } from 'vitest'
import {
  formatAsOf,
  formatCount,
  formatDate,
  formatDaysAgo,
  formatMonth,
  formatNumber,
  formatUpdatedAgo,
  formatValue,
  initials,
} from '../format'

test('turkish uses a comma decimal separator', () => {
  expect(formatNumber(5.2, 'tr')).toBe('5,2')
  expect(formatNumber(5.2, 'en')).toBe('5.2')
})

test('thousands are grouped by locale', () => {
  expect(formatNumber(42000, 'tr')).toBe('42.000')
  expect(formatNumber(42000, 'en')).toBe('42,000')
})

test('small integers are printed bare', () => {
  expect(formatNumber(60, 'tr')).toBe('60')
  expect(formatNumber(0, 'tr')).toBe('0')
})

test('missing values render as an em dash', () => {
  expect(formatNumber(null, 'tr')).toBe('—')
  expect(formatNumber(undefined, 'tr')).toBe('—')
  expect(formatNumber(Number.NaN, 'tr')).toBe('—')
})

test('percent units hug the number, other units get a space', () => {
  expect(formatValue(54, '%', 'tr')).toBe('54%')
  expect(formatValue(30, 'gün', 'tr')).toBe('30 gün')
  expect(formatValue(650, '₺', 'tr')).toBe('650 ₺')
})

test('a unitless value is just the number', () => {
  expect(formatValue(60, '', 'tr')).toBe('60')
})

test('initials take the first two words and drop the doctor title', () => {
  expect(initials('Elif Çınar')).toBe('EÇ')
  expect(initials('Dr. Hakan Yalın')).toBe('HY')
})

test('dates print in the local convention of each language', () => {
  expect(formatDate('2026-08-10', 'tr')).toBe('10.08.2026')
  expect(formatDate('2026-08-10', 'en')).toBe('Aug 10, 2026')
})

test('the day is not shifted by the server timezone', () => {
  // Formatting must not route through a local-time Date, which would render
  // 1 September as 31 August west of UTC.
  expect(formatDate('2025-09-01', 'tr')).toBe('01.09.2025')
  expect(formatDate('2025-09-01', 'en')).toBe('Sep 1, 2025')
})

test('a month reads as a short name and a year in both languages', () => {
  expect(formatMonth('2025-09', 'tr')).toBe('Eyl 2025')
  expect(formatMonth('2025-09', 'en')).toBe('Sep 2025')
  expect(formatMonth('2026-01', 'tr')).toBe('Oca 2026')
  expect(formatMonth('2026-12', 'en')).toBe('Dec 2026')
})

test('the cutoff phrase puts the date where each language wants it', () => {
  // The word order differs, so this is a formatter and not an i18n string with
  // a date appended.
  expect(formatAsOf('2026-03-31', 'tr')).toBe('31.03.2026 itibarıyla')
  expect(formatAsOf('2026-03-31', 'en')).toBe('as of Mar 31, 2026')
})

test('counts pluralise in english only', () => {
  expect(formatCount(3, 'objective', 'tr')).toBe('3 objective')
  expect(formatCount(0, 'objective', 'en')).toBe('0 objectives')
  expect(formatCount(1, 'objective', 'en')).toBe('1 objective')
  expect(formatCount(2, 'key result', 'en')).toBe('2 key results')
})

test('relative days read naturally in both languages', () => {
  expect(formatDaysAgo(1, 'tr')).toBe('1 gün önce')
  expect(formatDaysAgo(1, 'en')).toBe('1 day ago')
  expect(formatDaysAgo(4, 'en')).toBe('4 days ago')
  expect(formatUpdatedAgo(1, 'tr')).toBe('1 gün önce güncellendi')
  expect(formatUpdatedAgo(2, 'en')).toBe('updated 2 days ago')
})
