import { describe, expect, test } from 'vitest'
import { companyPct, deptPct, isMeasurable, krPct, objPct } from '../progress'

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

describe('a key result with no distance to cover cannot be measured', () => {
  test('start equal to target is not measurable', () => {
    expect(isMeasurable({ start: 77.5, current: 77.5, target: 77.5 })).toBe(false)
    expect(isMeasurable({ start: 0, current: 0, target: 0 })).toBe(false)
  })

  test('a real span is measurable, in both directions', () => {
    expect(isMeasurable({ start: 0, current: 0, target: 100 })).toBe(true)
    expect(isMeasurable({ start: 110, current: 110, target: 100 })).toBe(true)
  })

  test('an unmeasurable key result is left out of the objective average', () => {
    const measurable = { start: 0, current: 50, target: 100 }   // 50%
    const unmeasurable = { start: 5, current: 5, target: 5 }    // no span

    // The average is over the measurable one alone, not dragged to 25 by a zero.
    expect(objPct([measurable, unmeasurable])).toBe(50)
    expect(objPct([measurable])).toBe(50)
  })

  test('an objective whose key results are all unmeasurable is 0%, not NaN', () => {
    expect(objPct([{ start: 5, current: 5, target: 5 }])).toBe(0)
  })

  test('an objective with nothing measurable contributes nothing to the department average', () => {
    // Without excluding it, this would be mean(80, 0) = 40, not 80: the drag
    // objPct's filter removed at the key-result level would come straight
    // back at the objective level.
    expect(
      deptPct([
        { krs: [{ start: 0, current: 80, target: 100 }] },
        { krs: [{ start: 5, current: 5, target: 5 }] },
      ]),
    ).toBe(80)
  })

  test('deptPct is 0 when every objective is unmeasurable, not NaN', () => {
    expect(deptPct([{ krs: [{ start: 5, current: 5, target: 5 }] }])).toBe(0)
  })

  test('a department with nothing measurable contributes nothing to the company average', () => {
    // Without excluding it, this would be mean(60, 0) = 30, not 60.
    expect(
      companyPct([
        { objectives: [{ krs: [{ start: 0, current: 60, target: 100 }] }] },
        { objectives: [{ krs: [{ start: 5, current: 5, target: 5 }] }] },
      ]),
    ).toBe(60)
  })

  test('companyPct is 0 when every department has nothing measurable, not NaN', () => {
    expect(companyPct([{ objectives: [{ krs: [{ start: 5, current: 5, target: 5 }] }] }])).toBe(0)
  })
})
