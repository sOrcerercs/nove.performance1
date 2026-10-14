import { expect, test } from 'vitest'
import { companyPct, deptPct, objectiveWeightsComplete } from '../progress'
import { weightSetState } from '../weights'

/** An objective with one key result at `pct`% (start 0, target 100). */
const o = (pct: number, weight: number | null, periodId = 'p1') => ({
  krs: [{ start: 0, current: pct, target: 100 }],
  weight,
  periodId,
})
/** An objective whose only key result cannot be measured (start === target). */
const unmeasurable = (weight: number | null, periodId = 'p1') => ({
  krs: [{ start: 5, current: 5, target: 5 }],
  weight,
  periodId,
})

test('weightSetState', () => {
  expect(weightSetState([])).toBe('none')
  expect(weightSetState([null, null])).toBe('none')
  expect(weightSetState([60, 40])).toBe('complete')
  expect(weightSetState([33.34, 33.33, 33.33])).toBe('complete')
  expect(weightSetState([60, null])).toBe('incomplete')
  expect(weightSetState([60, 30])).toBe('incomplete')
})

test('a complete set weights the department average', () => {
  expect(deptPct([o(80, 70), o(40, 30)])).toBe(68)
})

test('an unweighted department keeps the plain mean', () => {
  expect(deptPct([o(80, null), o(40, null)])).toBe(60)
})

test('a partial set falls back to the plain mean', () => {
  expect(deptPct([o(80, 70), o(40, null)])).toBe(60)
})

test('a set that no longer adds up to 100 falls back to the plain mean', () => {
  expect(deptPct([o(80, 60), o(40, 30)])).toBe(60)
})

test('an unmeasurable objective keeps the set complete, drops out, and the rest are re-proportioned', () => {
  expect(objectiveWeightsComplete([o(80, 70), unmeasurable(30)])).toBe(true)
  expect(deptPct([o(80, 70), unmeasurable(30)])).toBe(80)
})

test('an objective left with no key results (unmeasured by the cutoff) keeps the set complete', () => {
  const emptied = { krs: [], weight: 40, periodId: 'p1' }
  expect(objectiveWeightsComplete([o(80, 60), emptied])).toBe(true)
  expect(deptPct([o(80, 60), emptied])).toBe(80)
})

test('two periods, both complete: weighted across both', () => {
  // (80·100 + 40·50 + 0·50) / 200 = 50; the plain mean would be 40.
  expect(deptPct([o(80, 100, 'p1'), o(40, 50, 'p2'), o(0, 50, 'p2')])).toBe(50)
})

test('two periods, one incomplete: the whole range falls back to the plain mean', () => {
  expect(deptPct([o(80, 100, 'p1'), o(40, null, 'p2'), o(0, null, 'p2')])).toBe(40)
})

test('companyPct averages departments plainly, each department weighted on its own', () => {
  // weighted 68 and plain 40 → 54
  expect(companyPct([{ objectives: [o(80, 70), o(40, 30)] }, { objectives: [o(40, null)] }])).toBe(54)
})

test('no objectives is 0, as before', () => {
  expect(deptPct([])).toBe(0)
  expect(objectiveWeightsComplete([])).toBe(false)
})
