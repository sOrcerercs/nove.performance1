import { expect, test } from 'vitest'
import { buildPresets, matchPreset, type PresetOption } from '../range-presets'

const INPUT = {
  today: '2026-08-10',
  defaultStart: '2025-09-01',
  activePeriod: { from: '2026-06-01', to: '2026-08-31' },
}

const rangeOf = (presets: PresetOption[], key: string) =>
  presets.find((p) => p.key === key)?.range

test('the default preset runs from the configured start to today', () => {
  expect(rangeOf(buildPresets(INPUT), 'fy')).toEqual({ from: '2025-09-01', to: '2026-08-10' })
})

test('the fiscal-year preset is first, so it is the default selection', () => {
  expect(buildPresets(INPUT)[0]?.key).toBe('fy')
})

test('the period preset spans the open period exactly', () => {
  expect(rangeOf(buildPresets(INPUT), 'period')).toEqual({ from: '2026-06-01', to: '2026-08-31' })
})

test('the period preset is dropped when no period is open', () => {
  const presets = buildPresets({ ...INPUT, activePeriod: null })
  expect(presets.some((p) => p.key === 'period')).toBe(false)
})

test('there is no "last 3 months" preset', () => {
  // Under cutoff semantics it meant "quarters touching the last three months,
  // each cumulative from its own start" — not what its name promises.
  expect(buildPresets(INPUT).map((p) => p.key)).not.toContain('last3m')
})

test('the previous fiscal year runs September to August', () => {
  expect(rangeOf(buildPresets(INPUT), 'prevFy')).toEqual({ from: '2024-09-01', to: '2025-08-31' })
})

test('a range that equals a preset is reported as that preset', () => {
  const presets = buildPresets(INPUT)
  expect(matchPreset({ from: '2025-09-01', to: '2026-08-10' }, presets)).toBe('fy')
  expect(matchPreset({ from: '2026-06-01', to: '2026-08-31' }, presets)).toBe('period')
})

test('a range that matches nothing is custom', () => {
  const presets = buildPresets(INPUT)
  expect(matchPreset({ from: '2026-01-01', to: '2026-03-15' }, presets)).toBe('custom')
})
