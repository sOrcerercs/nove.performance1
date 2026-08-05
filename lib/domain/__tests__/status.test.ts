import { expect, test } from 'vitest'
import { isOpenToDevelopment, statusOf } from '../status'

test.each([
  [140, 'above'],
  [130, 'above'],
  [101, 'above'],
  [100, 'expected'],
  [80, 'expected'],
  [79, 'below'],
  [60, 'below'],
  [59, 'open'],
  [1, 'open'],
  [0, 'none'],
] as const)('statusOf(%i) === %s', (pct, expected) => {
  expect(statusOf(pct)).toBe(expected)
})

test('open to development is 59 percent or under', () => {
  expect(isOpenToDevelopment(59)).toBe(true)
  expect(isOpenToDevelopment(60)).toBe(false)
})
