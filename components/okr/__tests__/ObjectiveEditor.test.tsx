import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useRouter } from 'next/navigation'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { todayInIstanbul } from '@/lib/domain/dates'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import type { ObjectiveDetailVm } from '@/lib/queries/department'
import { ObjectiveEditor } from '../ObjectiveEditor'

/**
 * Closing the single-writer invariant (Task 5) removed the ability to edit a
 * key result's `current` value directly here — correct, since it is a
 * derived summary now. But that removed a path without replacing it: this
 * pins the fix, a link out to the monthly entry screen for the exact key
 * result being looked at, so a wrong figure spotted here is not a dead end.
 */

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}))

// The real `next/link` reaches for App Router context this test does not set
// up; a plain anchor is all the assertions below need.
vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}))

vi.mock('@/lib/prefs/PrefsProvider', () => ({
  usePrefs: vi.fn(),
}))

vi.mock('@/components/ui/ToastProvider', () => ({
  useToast: vi.fn(() => vi.fn()),
}))

// These are 'use server' actions — real imports pull in next-auth/session
// machinery this test has no business booting. Unused here: neither test
// clicks Save or Sil.
vi.mock('@/lib/actions/objectives', () => ({
  updateObjective: vi.fn(),
  deleteObjective: vi.fn(),
  objectiveDeletionImpact: vi.fn(),
}))

const OBJ: ObjectiveDetailVm = {
  ownerUserId: null,
  id: 'o1',
  code: 'O1',
  titleTr: 'Örnek objective',
  titleEn: 'Sample objective',
  ownerName: '',
  pct: 0,
  deptId: 'd1',
  deptSlug: 'satis',
  deptEmoji: '📈',
  deptNameTr: 'Satış',
  deptNameEn: 'Sales',
  periodCode: '2026',
  krs: [
    {
      ownerUserId: null,
      id: 'k-sat-italya',
      titleTr: 'İtalya hasta sayısı',
      titleEn: 'Italy patient count',
      start: 0,
      current: 40,
      target: 200,
      unit: '',
      confidence: 'mid',
      rollup: 'sum',
      ownerName: '',
      pct: 20,
      daysSinceUpdate: 0,
      latestMonth: null,
      measuredByCutoff: true,
    },
  ],
}

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.mocked(useRouter).mockReturnValue(
    { push: vi.fn(), refresh: vi.fn() } as unknown as ReturnType<typeof useRouter>,
  )
  vi.mocked(usePrefs).mockReturnValue({
    t: ((key: string) => key) as never,
    lang: 'tr',
  } as unknown as ReturnType<typeof usePrefs>)
})

test('a key result offers a way to fix a wrong figure on the monthly entry screen', () => {
  render(<ObjectiveEditor obj={OBJ} people={[]} />)

  // The panel opens on demand — closed by default.
  fireEvent.click(screen.getByText('Düzenle'))

  const link = screen.getByText('fixInMonthlyEntry').closest('a')
  expect(link).not.toBeNull()

  const href = new URL(link!.getAttribute('href')!, 'http://localhost')
  expect(href.pathname).toBe('/veri-girisi')
  expect(href.searchParams.get('kr')).toBe('k-sat-italya')
  // The current Istanbul month — the same one the entry screen opens on by
  // default, so the link does not have to fight its fallback logic.
  expect(href.searchParams.get('ay')).toBe(todayInIstanbul().slice(0, 7))
})

test('a key result added in this session, with no monthly rows yet, offers no such link', () => {
  render(<ObjectiveEditor obj={OBJ} people={[]} />)
  fireEvent.click(screen.getByText('Düzenle'))
  fireEvent.click(screen.getByText(/addKr/))

  // Two key results now: the seeded one (linkable) and the new one (not).
  expect(screen.getAllByText('fixInMonthlyEntry')).toHaveLength(1)
})
