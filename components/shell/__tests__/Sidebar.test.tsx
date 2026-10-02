import { cleanup, render, screen } from '@testing-library/react'
import { usePathname, useSearchParams } from 'next/navigation'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth/permissions'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import type { SidebarData } from '@/lib/queries/sidebar'
import { Sidebar } from '../Sidebar'

/**
 * The layout now resolves the range once, server-side, from the
 * `x-search-params` header the middleware sets (`lib/queries/range.ts`'s
 * `searchParamsFromHeader`), and computes `data.pctBySlug` from the same
 * `loadTree` call the page uses. `Sidebar` itself no longer validates a range
 * at all — it only reads `data.pctBySlug` and carries `from`/`to` across
 * navigation via `withRange`.
 *
 * `Sidebar` pulls in a `'use server'` action (`./actions` → `next-auth`) that
 * vitest's module graph cannot resolve, so `next/navigation`, `usePrefs` and
 * `../actions` are all stubbed, letting the real component render.
 */

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
  useSearchParams: vi.fn(),
}))

vi.mock('@/lib/prefs/PrefsProvider', () => ({
  usePrefs: vi.fn(),
}))

vi.mock('../actions', () => ({
  signOutAction: vi.fn(),
}))

const DATA: SidebarData = {
  depts: [{ slug: 'eng', emoji: '⚙️', nameTr: 'Mühendislik', nameEn: 'Engineering' }],
  pctBySlug: { eng: 42 },
}

const USER: SessionUser = {
  id: 'u1',
  name: 'Test User',
  email: 't@example.com',
  role: 'admin',
  departmentId: null,
}

function setSearchParams(query: string) {
  vi.mocked(useSearchParams).mockReturnValue(
    new URLSearchParams(query) as unknown as ReturnType<typeof useSearchParams>,
  )
}

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.mocked(usePathname).mockReturnValue('/')
  vi.mocked(usePrefs).mockReturnValue({
    t: ((key: string) => key) as never,
    lang: 'tr',
  } as unknown as ReturnType<typeof usePrefs>)
})

function renderSidebar(overrides: Partial<ComponentProps<typeof Sidebar>> = {}) {
  return render(
    <Sidebar
      user={USER}
      data={DATA}
      canCreate={false}
      canManage={false}
      canEnterMonthly={false}
      {...overrides}
    />,
  )
}

test('the department percentage is read straight off data.pctBySlug, not recomputed', () => {
  setSearchParams('')
  renderSidebar()
  // 42 is data.pctBySlug.eng; a component still merging its own totals would
  // not show it verbatim, or would need periods/defaultRange props to do so.
  expect(screen.getByText('42%')).toBeTruthy()
})

test('a department missing from pctBySlug renders 0%, not a crash', () => {
  setSearchParams('')
  renderSidebar({
    data: {
      depts: [{ slug: 'ghost', emoji: '👻', nameTr: 'Hayalet', nameEn: 'Ghost' }],
      pctBySlug: {},
    },
  })
  expect(screen.getByText('0%')).toBeTruthy()
})

test('withRange carries a from/to pair from the URL onto a nav link', () => {
  setSearchParams('from=2026-04-01&to=2026-06-30')
  renderSidebar()
  const link = screen.getByRole('link', { name: /Mühendislik/ })
  expect(link.getAttribute('href')).toBe('/bolum/eng?from=2026-04-01&to=2026-06-30')
})

test('with no range in the URL a nav link is left plain', () => {
  setSearchParams('')
  renderSidebar()
  const link = screen.getByRole('link', { name: /Mühendislik/ })
  expect(link.getAttribute('href')).toBe('/bolum/eng')
})

test('the monthly entry link only shows for a user who can edit at least one key result', () => {
  setSearchParams('')
  renderSidebar({ canEnterMonthly: false })
  expect(screen.queryByText('navMonthlyEntry')).toBeNull()

  cleanup()
  setSearchParams('')
  renderSidebar({ canEnterMonthly: true })
  expect(screen.getByText('navMonthlyEntry')).toBeTruthy()
})

test('Anasayfa sits above the overview and opens the welcome screen', () => {
  setSearchParams('from=2026-04-01&to=2026-06-30')
  renderSidebar()
  const links = screen.getAllByRole('link').map((a) => a.textContent)
  const home = screen.getByRole('link', { name: 'navHome' })
  // The welcome screen has no date range, so the link stays plain.
  expect(home.getAttribute('href')).toBe('/hosgeldin')
  expect(links.indexOf('navHome')).toBe(links.indexOf('overview') - 1)
})
