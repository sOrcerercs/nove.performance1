import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { PresetOption } from '@/lib/domain/range-presets'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import { DateRangePicker } from '../DateRangePicker'

/**
 * The picker is the only place a range preset resolves to concrete dates and
 * the only place stale query params get cleaned up, so both of those need
 * real assertions against what actually lands in the URL — not a snapshot of
 * markup that would pass even if the dates were wrong.
 *
 * `apply()` also calls `router.refresh()` after `router.push()`: Next only
 * appends the query string to a segment's `__PAGE__` key, so a
 * searchParams-only push does not re-execute this route's layout — and the
 * sidebar, which renders there, would keep the previous range's numbers
 * beside an already-updated page. The two tests below that assert `refresh`
 * was called only pin that the call happens on this mock; they cannot observe
 * (and are not meant to prove) that a real Next router actually re-executes
 * the layout — that is verified against the running app, not here.
 */

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  usePathname: vi.fn(),
  useSearchParams: vi.fn(),
}))

vi.mock('@/lib/prefs/PrefsProvider', () => ({
  usePrefs: vi.fn(),
}))

const push = vi.fn()
const refresh = vi.fn()

const PRESETS: PresetOption[] = [
  { key: 'fy', range: { from: '2026-01-01', to: '2026-08-10' } },
  { key: 'period', range: { from: '2026-07-01', to: '2026-09-30' } },
]

function setSearchParams(query: string) {
  vi.mocked(useSearchParams).mockReturnValue(
    new URLSearchParams(query) as unknown as ReturnType<typeof useSearchParams>,
  )
}

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  push.mockClear()
  refresh.mockClear()
  vi.mocked(useRouter).mockReturnValue({ push, refresh } as unknown as ReturnType<typeof useRouter>)
  vi.mocked(usePathname).mockReturnValue('/rapor')
  setSearchParams('')
  vi.mocked(usePrefs).mockReturnValue({
    t: ((key: string) => key) as never,
    lang: 'tr',
  } as unknown as ReturnType<typeof usePrefs>)
})

test('picking a preset pushes its resolved dates, not the preset name', () => {
  render(
    <DateRangePicker
      presets={PRESETS}
      preset="fy"
      range={{ from: '2026-01-01', to: '2026-08-10' }}
    />,
  )

  fireEvent.change(screen.getByLabelText('dateRange'), { target: { value: 'period' } })

  expect(push).toHaveBeenCalledTimes(1)
  const [url] = push.mock.calls[0] as [string]
  expect(url).toBe('/rapor?from=2026-07-01&to=2026-09-30')
  expect(url).not.toContain('period')
  // Without this, a searchParams-only navigation would not re-execute the
  // layout and the sidebar would render the previous range's numbers.
  expect(refresh).toHaveBeenCalledTimes(1)
})

test('applying a custom range keeps unrelated params and drops a stale period param', () => {
  setSearchParams('sort=pct&period=2026-Q3')

  render(
    <DateRangePicker
      presets={PRESETS}
      preset="custom"
      range={{ from: '2026-01-01', to: '2026-08-10' }}
    />,
  )

  fireEvent.change(screen.getByLabelText('rangeFrom'), { target: { value: '2026-02-01' } })
  fireEvent.change(screen.getByLabelText('rangeTo'), { target: { value: '2026-02-28' } })
  fireEvent.click(screen.getByRole('button', { name: 'apply' }))

  expect(push).toHaveBeenCalledTimes(1)
  const [url] = push.mock.calls[0] as [string]
  const [, query] = url.split('?')
  const params = new URLSearchParams(query)
  expect(params.get('sort')).toBe('pct')
  expect(params.get('from')).toBe('2026-02-01')
  expect(params.get('to')).toBe('2026-02-28')
  expect(params.has('period')).toBe(false)
  // Same mechanism as the preset case above: a custom range is also a
  // searchParams-only navigation.
  expect(refresh).toHaveBeenCalledTimes(1)
})

test('the Apply button is disabled for an inverted range and enabled for a valid one', () => {
  render(
    <DateRangePicker
      presets={PRESETS}
      preset="custom"
      range={{ from: '2026-01-01', to: '2026-08-10' }}
    />,
  )

  const fromInput = screen.getByLabelText('rangeFrom') as HTMLInputElement
  const toInput = screen.getByLabelText('rangeTo') as HTMLInputElement
  const applyButton = screen.getByRole('button', { name: 'apply' }) as HTMLButtonElement

  fireEvent.change(fromInput, { target: { value: '2026-08-10' } })
  fireEvent.change(toInput, { target: { value: '2026-01-01' } })
  expect(applyButton.disabled).toBe(true)

  fireEvent.change(fromInput, { target: { value: '2026-01-01' } })
  fireEvent.change(toInput, { target: { value: '2026-08-10' } })
  expect(applyButton.disabled).toBe(false)
})

test('a new range prop resyncs the draft inputs instead of keeping the stale draft', () => {
  const { rerender } = render(
    <DateRangePicker
      presets={PRESETS}
      preset="custom"
      range={{ from: '2026-01-01', to: '2026-08-10' }}
    />,
  )

  // The user starts typing a draft that never gets applied.
  fireEvent.change(screen.getByLabelText('rangeFrom'), { target: { value: '2026-03-03' } })

  // Navigation elsewhere resolves a different range; the picker is not
  // remounted, so this arrives as a new `range` prop.
  rerender(
    <DateRangePicker
      presets={PRESETS}
      preset="custom"
      range={{ from: '2026-07-01', to: '2026-09-30' }}
    />,
  )

  expect((screen.getByLabelText('rangeFrom') as HTMLInputElement).value).toBe('2026-07-01')
  expect((screen.getByLabelText('rangeTo') as HTMLInputElement).value).toBe('2026-09-30')
})
