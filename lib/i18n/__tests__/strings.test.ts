import { expect, test } from 'vitest'
import { STR, tx } from '../strings'

test('tr and en dictionaries expose identical keys', () => {
  expect(Object.keys(STR.en).sort()).toEqual(Object.keys(STR.tr).sort())
})

test('the dictionary actually carries the prototype copy', () => {
  expect(STR.tr.overviewTitle).toBe('Performans Özeti')
  expect(STR.en.overviewTitle).toBe('Performance Overview')
  expect(Object.keys(STR.tr).length).toBeGreaterThan(100)
})

test('no dictionary value is empty', () => {
  for (const lang of ['tr', 'en'] as const) {
    for (const [key, value] of Object.entries(STR[lang])) {
      expect(value, `${lang}.${key}`).not.toBe('')
    }
  }
})

test('tx falls back to turkish when the english field is missing', () => {
  expect(tx({ tr: 'Pazarlama', en: 'Marketing' }, 'en')).toBe('Marketing')
  expect(tx({ tr: 'Pazarlama', en: '' }, 'en')).toBe('Pazarlama')
  expect(tx(null, 'tr')).toBe('')
})
