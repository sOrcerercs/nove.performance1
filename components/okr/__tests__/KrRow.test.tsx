import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { STR, type StringKey } from '@/lib/i18n/strings'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import type { KrVm } from '@/lib/queries/department'
import { KrRow } from '../KrRow'

/**
 * `target === start` means there is no distance to cover, so `krPct` would
 * report 0% for any current value — indistinguishable from genuine "no
 * progress". The row must show the "Ölçülemiyor" badge instead, not a
 * misleading 0%, and must not render the progress bar as a filled-to-zero
 * bar either.
 */

vi.mock('@/lib/prefs/PrefsProvider', () => ({
  usePrefs: vi.fn(),
}))

// Unit left blank so formatted start/current/target values never collide
// with the percentage text asserted on below (e.g. a "%" unit would make the
// target cell read "50%" too, breaking `getByText`'s single-match guarantee).
const BASE: KrVm = {
  ownerUserId: 'u1',
  id: 'kr1',
  titleTr: 'Örnek key result',
  titleEn: 'Sample key result',
  start: 0,
  current: 0,
  target: 100,
  unit: '',
  confidence: 'high',
  rollup: 'last',
  weight: null,
  ownerName: 'Test Owner',
  pct: 0,
  daysSinceUpdate: 0,
  latestMonth: null,
  measuredByCutoff: true,
}

/** Fills in every `KrVm` field so each test only spells out what it varies. */
function krVm(overrides: Partial<KrVm> = {}): KrVm {
  return { ...BASE, ...overrides }
}

beforeEach(() => {
  vi.mocked(usePrefs).mockReturnValue({
    t: ((key: StringKey) => STR.tr[key]) as never,
    lang: 'tr',
    compact: false,
  } as unknown as ReturnType<typeof usePrefs>)
})

afterEach(() => {
  cleanup()
})

test('a key result with no span shows the not-measurable badge instead of a percentage', () => {
  render(
    <table>
      <tbody>
        <KrRow kr={{ ...BASE, start: 5, current: 5, target: 5, pct: 0 }} asOfMonth="2026-03" />
      </tbody>
    </table>,
  )
  expect(screen.getByText('Ölçülemiyor')).toBeTruthy()
  expect(screen.queryByText('0%')).toBeNull()
  expect(screen.getByText('Ölçülemiyor').title).toBe('Başlangıç ve hedef aynı')
})

test('a normal key result still shows its percentage and no badge', () => {
  render(
    <table>
      <tbody>
        <KrRow kr={{ ...BASE, start: 0, current: 50, target: 100, pct: 50 }} asOfMonth="2026-03" />
      </tbody>
    </table>,
  )
  expect(screen.getByText('50%')).toBeTruthy()
  expect(screen.queryByText('Ölçülemiyor')).toBeNull()
})

// Rendered inside <table><tbody>, as the other tests above do: `KrRow` is a
// bare <tr> and this file has no jest-dom, so `.toBeTruthy()`/`.toBeNull()`
// on `screen.getByText`/`queryByText` are the assertions this codebase uses
// in place of `.toBeInTheDocument()`.

test('a figure measured before the cutoff is marked with its month', () => {
  render(
    <table>
      <tbody>
        <KrRow kr={krVm({ latestMonth: '2025-09' })} asOfMonth="2026-03" />
      </tbody>
    </table>,
  )
  // The full phrase, not just the month: a marker that dropped the "son
  // veri:" label (or the colon) would still pass a bare /Eyl 2025/ regex.
  expect(screen.getByText(/son veri: Eyl 2025/)).toBeTruthy()
})

test('a figure measured in the cutoff month itself is not marked', () => {
  render(
    <table>
      <tbody>
        <KrRow kr={krVm({ latestMonth: '2026-03' })} asOfMonth="2026-03" />
      </tbody>
    </table>,
  )
  expect(screen.queryByText(/son veri/)).toBeNull()
})

test('a key result on the summary bridge is not marked', () => {
  render(
    <table>
      <tbody>
        <KrRow kr={krVm({ latestMonth: null })} asOfMonth="2026-03" />
      </tbody>
    </table>,
  )
  expect(screen.queryByText(/son veri/)).toBeNull()
})

test('a key result unmeasured by the cutoff says so', () => {
  // Exactly the shape `loadTree` produces for it: `current` fallen back to
  // `start`, `latestMonth` null. Without the marker this row is pixel-identical
  // to one genuinely sitting at its start — a 0% bar under an objective
  // percentage that quietly excluded it.
  render(
    <table>
      <tbody>
        <KrRow
          kr={krVm({ measuredByCutoff: false, current: 0, pct: 0, latestMonth: null })}
          asOfMonth="2026-03"
        />
      </tbody>
    </table>,
  )
  expect(screen.getByText('ölçülmedi')).toBeTruthy()
  // The hint carries the "why" — a marker without it would still pass a bare
  // text assertion while leaving the reader no explanation for the 0%.
  expect(screen.getByText('ölçülmedi').title).toBe(STR.tr.notMeasuredHint)
})

test('a measured key result carries no unmeasured marker', () => {
  render(
    <table>
      <tbody>
        <KrRow kr={krVm({ measuredByCutoff: true, latestMonth: '2025-09' })} asOfMonth="2026-03" />
      </tbody>
    </table>,
  )
  expect(screen.queryByText('ölçülmedi')).toBeNull()
  // The slot the two markers share still shows the one that belongs there, so
  // this is not passing merely because the cell went blank.
  expect(screen.getByText(/son veri: Eyl 2025/)).toBeTruthy()
})
