import { describe, expect, test } from 'vitest'
import { checkWeights, equalWeights, weightTotal } from '../weights'

describe('checkWeights', () => {
  test('all set and adding up to 100 is fine, floating point included', () => {
    expect(checkWeights([50, 30, 20], { required: true })).toBeNull()
    expect(checkWeights([33.34, 33.33, 33.33], { required: true })).toBeNull()
  })
  test('a total off by a hundredth is refused', () => {
    expect(checkWeights([33.33, 33.33, 33.33], { required: true })).toBe('total')
    expect(checkWeights([50, 50.01], { required: true })).toBe('total')
  })
  test('none set: refused for a new objective, fine for an existing one', () => {
    expect(checkWeights([null, undefined], { required: true })).toBe('missing')
    expect(checkWeights([null, null], { required: false })).toBeNull()
  })
  test('some set, some not, is refused either way', () => {
    expect(checkWeights([100, null], { required: false })).toBe('partial')
  })
  test('out of range or more than two decimals is refused', () => {
    expect(checkWeights([0, 100], { required: true })).toBe('range')
    expect(checkWeights([-10, 110], { required: true })).toBe('range')
    expect(checkWeights([33.333, 66.667], { required: true })).toBe('range')
  })
})

test('weightTotal ignores blanks and rounds to two decimals', () => {
  expect(weightTotal([33.34, 33.33, null, 33.33])).toBe(100)
  expect(weightTotal([0.1, 0.2])).toBe(0.3)
})

test('equalWeights adds up to exactly 100, the remainder going to the first', () => {
  expect(equalWeights(3)).toEqual([33.34, 33.33, 33.33])
  expect(equalWeights(1)).toEqual([100])
  const six = equalWeights(6)
  expect(weightTotal(six)).toBe(100)
  expect(checkWeights(six, { required: true })).toBeNull()
})
