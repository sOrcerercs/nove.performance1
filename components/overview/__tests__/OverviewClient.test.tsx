import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { STR, type StringKey } from '@/lib/i18n/strings'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import type { OverviewVm } from '@/lib/queries/overview'
import { OverviewClient } from '../OverviewClient'

/**
 * Both markers used to live inside `CompanyHero`, which only renders on the
 * "hero" layout variant — silently hiding the cutoff notice and the
 * measured-KR counter on "cockpit" and "focus" even though those layouts show
 * the exact same cutoff-filtered numbers. They now live in the page header
 * this component renders once, above the layout fork, so the "cockpit" case
 * below is the regression guard: without it, the marker could move right
 * back into a layout-gated block and nothing would catch it.
 *
 * `.toBeTruthy()` / `.toBeNull()` stand in for `.toBeInTheDocument()`: this
 * repo has no jest-dom (see `KrRow.test.tsx`).
 */

vi.mock('@/lib/prefs/PrefsProvider', () => ({
  usePrefs: vi.fn(),
}))

// Empty depts/attention/trend/distribution so the child components (DeptCard,
// AttentionList, TrendChart, DonutChart, BarChart) all take their documented
// empty-state paths instead of needing their own fixtures here — this test is
// only about the header, not about any of those.
const VM: OverviewVm = {
  companyPct: 48,
  kpis: { depts: 8, objectives: 20, krs: 63, measuredKrs: 63, avgPct: 48, openKrs: 4 },
  depts: [],
  attention: [],
  trend: [],
  distribution: [],
  periodCodes: ['FY26'],
}

function mockPrefs(layout: 'hero' | 'cockpit' | 'focus' = 'hero') {
  vi.mocked(usePrefs).mockReturnValue({
    t: ((key: StringKey) => STR.tr[key]) as never,
    lang: 'tr',
    layout,
    setLayout: vi.fn(),
  } as unknown as ReturnType<typeof usePrefs>)
}

beforeEach(() => {
  mockPrefs('hero')
})

afterEach(() => {
  cleanup()
})

test('the cutoff is announced only when it is in the past', () => {
  const { rerender } = render(<OverviewClient vm={VM} asOf="2026-03-31" today="2026-08-13" />)
  expect(screen.getByText(/31\.03\.2026 itibarıyla/)).toBeTruthy()

  // Live view: the picker's own label already says "to today".
  rerender(<OverviewClient vm={VM} asOf="2026-08-13" today="2026-08-13" />)
  expect(screen.queryByText(/itibarıyla/)).toBeNull()
})

test('the measured counter appears only when some key result is unmeasured', () => {
  const { rerender } = render(<OverviewClient vm={VM} asOf="2026-08-13" today="2026-08-13" />)
  expect(screen.queryByText(/ölçülen KR/)).toBeNull()

  rerender(
    <OverviewClient
      vm={{ ...VM, kpis: { ...VM.kpis, measuredKrs: 58 } }}
      asOf="2026-08-13"
      today="2026-08-13"
    />,
  )
  expect(screen.getByText(/58\/63/)).toBeTruthy()
})

test('the cutoff indicator still renders on the cockpit layout, not just hero', () => {
  mockPrefs('cockpit')
  render(<OverviewClient vm={VM} asOf="2026-03-31" today="2026-08-13" />)
  expect(screen.getByText(/31\.03\.2026 itibarıyla/)).toBeTruthy()
})
