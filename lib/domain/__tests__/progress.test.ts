import { describe, expect, test } from 'vitest'
import { companyPct, deptPct, krPct, objPct } from '../progress'

describe('krPct', () => {
  test('linear progress between start and target', () => {
    // k2 in the prototype seed: organic traffic 42000 -> 61000, target 80000
    expect(krPct({ start: 42000, current: 61000, target: 80000 })).toBe(50)
  })

  test('works when the target is lower than the start (reduction goals)', () => {
    // k1: cost per lead 950 -> 720, target 650
    expect(krPct({ start: 950, current: 720, target: 650 })).toBe(77)
  })

  test('clamps to 0 when moving away from the target', () => {
    expect(krPct({ start: 100, current: 120, target: 50 })).toBe(0)
  })

  test('clamps to 140 rather than unbounded overshoot', () => {
    expect(krPct({ start: 0, current: 500, target: 100 })).toBe(140)
  })

  test('returns 0 when the span is zero', () => {
    expect(krPct({ start: 50, current: 70, target: 50 })).toBe(0)
  })
})

describe('rollups are unweighted means of the level below', () => {
  test('objPct averages its key results', () => {
    expect(
      objPct([
        { start: 0, current: 50, target: 100 },
        { start: 0, current: 80, target: 100 },
      ]),
    ).toBe(65)
  })

  test('objPct is 0 for an objective with no key results', () => {
    expect(objPct([])).toBe(0)
  })

  test('deptPct averages objectives, not key results', () => {
    // One objective at 100, one at 0 -> 50, even though the KR counts differ.
    // A KR-weighted average would give 33 here; that would be wrong.
    expect(
      deptPct([
        { krs: [{ start: 0, current: 100, target: 100 }] },
        {
          krs: [
            { start: 0, current: 0, target: 100 },
            { start: 0, current: 0, target: 100 },
          ],
        },
      ]),
    ).toBe(50)
  })

  test('companyPct ignores departments with no objectives', () => {
    expect(
      companyPct([
        { objectives: [{ krs: [{ start: 0, current: 40, target: 100 }] }] },
        { objectives: [] },
      ]),
    ).toBe(40)
  })

  test('companyPct is 0 when nothing has been set up yet', () => {
    expect(companyPct([])).toBe(0)
  })
})
