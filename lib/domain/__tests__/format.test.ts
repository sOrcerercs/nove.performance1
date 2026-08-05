import { expect, test } from 'vitest'
import { formatNumber, formatValue, initials } from '../format'

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
