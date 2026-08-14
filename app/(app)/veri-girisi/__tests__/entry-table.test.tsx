import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useToast } from '@/components/ui/ToastProvider'
import { setMonthlyValues } from '@/lib/actions/admin'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import type { MonthlyEntryVm } from '@/lib/queries/monthly'
import { EntryTable } from '../entry-table'

/**
 * The screen's whole reason for a "not entered" vs "0" distinction: a blank
 * field must never reach the server as a value, and a genuine `0` must always
 * reach it. Getting this backwards would silently turn every unfilled row
 * into a real zero measurement — the bug this test exists to catch.
 *
 * Follows the stub pattern from DateRangePicker.test.tsx: `next/navigation`
 * and `usePrefs` are mocked so the real component renders without a Next
 * router or the PrefsProvider context; the server action is mocked too, since
 * it is a `'use server'` export this test must not actually invoke.
 */

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  usePathname: vi.fn(),
  useSearchParams: vi.fn(),
}))

vi.mock('@/lib/prefs/PrefsProvider', () => ({
  usePrefs: vi.fn(),
}))

vi.mock('@/components/ui/ToastProvider', () => ({
  useToast: vi.fn(),
}))

vi.mock('@/lib/actions/admin', () => ({
  setMonthlyValues: vi.fn(),
}))

const push = vi.fn()
const refresh = vi.fn()
const toast = vi.fn()

function vmWith(rows: MonthlyEntryVm['depts'][number]['rows']): MonthlyEntryVm {
  return {
    months: ['2026-07', '2026-08'],
    month: '2026-08',
    depts: [{ id: 'd1', slug: 'd1', emoji: '🏢', nameTr: 'Bölüm 1', nameEn: 'Dept 1', rows }],
    filledCount: rows.filter((r) => r.canEdit && r.value !== null).length,
    editableCount: rows.filter((r) => r.canEdit).length,
  }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// jsdom has no layout engine, so `scrollIntoView` does not exist at all —
// unlike a real browser, where it always does. Stubbed here purely so the
// highlight effect below has something to call; not something under test.
Element.prototype.scrollIntoView = vi.fn()

beforeEach(() => {
  vi.mocked(useRouter).mockReturnValue({ push, refresh } as unknown as ReturnType<typeof useRouter>)
  vi.mocked(usePathname).mockReturnValue('/veri-girisi')
  vi.mocked(useSearchParams).mockReturnValue(
    new URLSearchParams() as unknown as ReturnType<typeof useSearchParams>,
  )
  vi.mocked(usePrefs).mockReturnValue({
    t: ((key: string) => key) as never,
    lang: 'tr',
  } as unknown as ReturnType<typeof usePrefs>)
  vi.mocked(useToast).mockReturnValue(toast)
  vi.mocked(setMonthlyValues).mockResolvedValue({
    ok: true,
    data: [{ krId: 'kr-b', month: '2026-08', ok: true, current: 0 }],
  })
})

test('a field left blank is not saved; a field with 0 typed is saved', async () => {
  const vm = vmWith([
    { krId: 'kr-a', titleTr: 'KR A', titleEn: 'KR A', rollup: 'sum', target: 100, unit: '', value: null, canEdit: true },
    { krId: 'kr-b', titleTr: 'KR B', titleEn: 'KR B', rollup: 'avg', target: 50, unit: '%', value: null, canEdit: true },
  ])
  render(<EntryTable vm={vm} />)

  // KR A is left blank entirely — never touched.
  // KR B gets a genuine zero.
  fireEvent.change(screen.getByLabelText('KR B — 2026-08'), { target: { value: '0' } })

  fireEvent.click(screen.getByRole('button', { name: 'saveEntries' }))

  await waitFor(() => expect(setMonthlyValues).toHaveBeenCalledTimes(1))
  const [items] = vi.mocked(setMonthlyValues).mock.calls[0] as [
    { krId: string; month: string; value: number }[],
  ]
  expect(items).toEqual([{ krId: 'kr-b', month: '2026-08', value: 0 }])
})

test('clearing a previously filled field back to blank drops it from the save, not zeroes it', async () => {
  const vm = vmWith([
    { krId: 'kr-a', titleTr: 'KR A', titleEn: 'KR A', rollup: 'sum', target: 100, unit: '', value: 40, canEdit: true },
  ])
  render(<EntryTable vm={vm} />)

  fireEvent.change(screen.getByLabelText('KR A — 2026-08'), { target: { value: '' } })

  // Nothing is dirty once the field is blank again — there is no "unset"
  // action to send, so Save has nothing to do.
  expect((screen.getByRole('button', { name: 'saveEntries' }) as HTMLButtonElement).disabled).toBe(true)

  fireEvent.click(screen.getByRole('button', { name: 'saveEntries' }))
  expect(setMonthlyValues).not.toHaveBeenCalled()
})

test('a row without permission renders read-only and cannot be made dirty', async () => {
  const vm = vmWith([
    { krId: 'kr-a', titleTr: 'KR A', titleEn: 'KR A', rollup: 'sum', target: 100, unit: '', value: null, canEdit: false },
  ])
  render(<EntryTable vm={vm} />)

  const input = screen.getByLabelText('KR A — 2026-08') as HTMLInputElement
  expect(input.disabled).toBe(true)
  expect((screen.getByRole('button', { name: 'saveEntries' }) as HTMLButtonElement).disabled).toBe(true)
})

test('typing a real number enables Save and reports one unsaved change', () => {
  const vm = vmWith([
    { krId: 'kr-a', titleTr: 'KR A', titleEn: 'KR A', rollup: 'sum', target: 100, unit: '', value: null, canEdit: true },
  ])
  render(<EntryTable vm={vm} />)

  expect((screen.getByRole('button', { name: 'saveEntries' }) as HTMLButtonElement).disabled).toBe(true)

  fireEvent.change(screen.getByLabelText('KR A — 2026-08'), { target: { value: '12.5' } })

  expect((screen.getByRole('button', { name: 'saveEntries' }) as HTMLButtonElement).disabled).toBe(false)
  expect(screen.getByText('1 unsavedChanges')).toBeTruthy()
})

/* -------------- Task 5 fix round 1: arriving via the "fix in monthly entry" link -------------- */

test('a `kr` search param marks the matching row, and only that row', () => {
  vi.mocked(useSearchParams).mockReturnValue(
    new URLSearchParams('kr=kr-b') as unknown as ReturnType<typeof useSearchParams>,
  )
  const vm = vmWith([
    { krId: 'kr-a', titleTr: 'KR A', titleEn: 'KR A', rollup: 'sum', target: 100, unit: '', value: null, canEdit: true },
    { krId: 'kr-b', titleTr: 'KR B', titleEn: 'KR B', rollup: 'avg', target: 50, unit: '%', value: null, canEdit: true },
  ])
  render(<EntryTable vm={vm} />)

  const rowA = screen.getByLabelText('KR A — 2026-08').closest('tr')
  const rowB = screen.getByLabelText('KR B — 2026-08').closest('tr')
  expect(rowA?.id).not.toBe('')
  expect(rowB?.id).toBe(rowA?.id!.replace('kr-a', 'kr-b'))
  expect(rowB?.className).toContain('rowHighlighted')
  expect(rowA?.className).not.toContain('rowHighlighted')
})

test('no `kr` search param highlights nothing', () => {
  const vm = vmWith([
    { krId: 'kr-a', titleTr: 'KR A', titleEn: 'KR A', rollup: 'sum', target: 100, unit: '', value: null, canEdit: true },
  ])
  render(<EntryTable vm={vm} />)

  const rowA = screen.getByLabelText('KR A — 2026-08').closest('tr')
  expect(rowA?.className).not.toContain('rowHighlighted')
})

/* -------------- Task 5 fix round 2: the linked key result is not on this screen -------------- */

test('a `kr` param naming a key result absent from this period\'s table shows an explanation', () => {
  vi.mocked(useSearchParams).mockReturnValue(
    new URLSearchParams('kr=kr-not-here') as unknown as ReturnType<typeof useSearchParams>,
  )
  const vm = vmWith([
    { krId: 'kr-a', titleTr: 'KR A', titleEn: 'KR A', rollup: 'sum', target: 100, unit: '', value: null, canEdit: true },
  ])
  render(<EntryTable vm={vm} />)

  expect(screen.getByText('krNotInEntryTable')).toBeTruthy()
})

test('a `kr` param naming a row that IS present shows no explanation', () => {
  vi.mocked(useSearchParams).mockReturnValue(
    new URLSearchParams('kr=kr-a') as unknown as ReturnType<typeof useSearchParams>,
  )
  const vm = vmWith([
    { krId: 'kr-a', titleTr: 'KR A', titleEn: 'KR A', rollup: 'sum', target: 100, unit: '', value: null, canEdit: true },
  ])
  render(<EntryTable vm={vm} />)

  expect(screen.queryByText('krNotInEntryTable')).toBeNull()
})
