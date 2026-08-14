import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { STR, type StringKey } from '@/lib/i18n/strings'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import type { OverviewTrendPoint } from '@/lib/queries/overview'
import { TrendChart, x } from '../TrendChart'

/**
 * There is no monthly history table yet, so `buildTrend` hands this component
 * either zero or one point, never the prototype's fabricated six-month ramp.
 * Both shapes must render without throwing, and an empty series must say so
 * explicitly rather than leaving an unexplained blank box.
 *
 * A later phase feeds this a sparse series of real monthly values, so a point
 * must be placed by its own `month` field, never by its position in the
 * array — indexing by position would squeeze e.g. March/May/August into
 * January/February/March's slots, closing up the very gaps a sparse series
 * exists to show.
 */

vi.mock('@/lib/prefs/PrefsProvider', () => ({
  usePrefs: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(usePrefs).mockReturnValue({
    t: ((key: StringKey) => STR.tr[key]) as never,
    lang: 'tr',
  } as unknown as ReturnType<typeof usePrefs>)
})

afterEach(() => {
  cleanup()
})

test('an empty series shows an explicit empty state, not a blank chart', () => {
  render(<TrendChart trend={[]} />)
  expect(screen.getByText(STR.tr.trendEmpty)).toBeTruthy()
  expect(document.querySelector('svg')).toBeNull()
})

test('a single real point renders the chart without throwing', () => {
  const trend: OverviewTrendPoint[] = [{ month: '03', actual: 42, pace: 18 }]
  render(<TrendChart trend={trend} />)
  expect(document.querySelector('svg')).toBeTruthy()
  expect(screen.queryByText(STR.tr.trendEmpty)).toBeNull()
})

test('a single point at month "08" is drawn at August\'s position and labelled August, not January', () => {
  const trend: OverviewTrendPoint[] = [{ month: '08', actual: 55, pace: 41 }]
  const { container } = render(<TrendChart trend={trend} />)

  const circle = container.querySelector('circle')
  expect(circle).toBeTruthy()
  // August is calendar index 7 (0 = January). Indexing by array position
  // (the bug this guards against) would have placed the sole point at
  // x(0) — January's slot — instead.
  expect(Number(circle?.getAttribute('cx'))).toBe(x(7))
  expect(Number(circle?.getAttribute('cx'))).not.toBe(x(0))

  const label = container.querySelector('svg')?.getAttribute('aria-label') ?? ''
  expect(label).toContain('Ağu')
  expect(label).not.toContain('Oca:')
})

test('a sparse series places each point at its own month, not squeezed by array position', () => {
  const trend: OverviewTrendPoint[] = [
    { month: '03', actual: 10, pace: 18 }, // March -> calendar index 2
    { month: '05', actual: 20, pace: 36 }, // May -> calendar index 4
    { month: '08', actual: 30, pace: 64 }, // August -> calendar index 7
  ]
  const { container } = render(<TrendChart trend={trend} />)

  const cxs = Array.from(container.querySelectorAll('circle')).map((c) =>
    Number(c.getAttribute('cx')),
  )
  // Correct: each point at its own calendar slot, gaps left open. An
  // index-based bug would instead have produced [x(0), x(1), x(2)],
  // closing March/May/August up into January/February/March.
  expect(cxs).toEqual([x(2), x(4), x(7)])
})
