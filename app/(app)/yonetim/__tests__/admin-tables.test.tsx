import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useRouter } from 'next/navigation'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import type { AdminUser, AdminVm } from '@/lib/queries/admin'
import { updateUserAccount } from '@/lib/actions/admin'
import { AdminTables } from '../admin-tables'

vi.mock('next/navigation', () => ({ useRouter: vi.fn() }))
vi.mock('@/lib/prefs/PrefsProvider', () => ({ usePrefs: vi.fn() }))
vi.mock('@/components/ui/ToastProvider', () => ({ useToast: vi.fn(() => vi.fn()) }))
vi.mock('@/lib/actions/admin', () => ({
  createPeriod: vi.fn(), createUser: vi.fn(), deleteUser: vi.fn(), setDefaultRangeStart: vi.fn(),
  setPeriodState: vi.fn(), updatePeriodDates: vi.fn(), setUserRole: vi.fn(), setUserState: vi.fn(),
  updateUserFields: vi.fn(), updateUserAccount: vi.fn(),
}))
vi.mock('../departments-table', () => ({ DepartmentsTable: () => null }))

const person = (over: Partial<AdminUser>): AdminUser => ({
  id: 'u-ayse', name: 'Ayşe', email: null, role: 'staff', departmentId: null,
  departmentName: '', departmentNameEn: '', state: 'active', krsOwned: 0,
  managerId: null, managerName: '', title: null, mustChangePassword: false, hasPassword: false,
  ...over,
})

const vm = (users: AdminUser[]): AdminVm => ({
  users, periods: [], departments: [], departmentRows: [], defaultRangeStart: '2026-01-01',
})

beforeEach(() => {
  vi.mocked(useRouter).mockReturnValue({ refresh: vi.fn() } as unknown as ReturnType<typeof useRouter>)
  vi.mocked(usePrefs).mockReturnValue({
    t: ((key: string) => key) as never,
    lang: 'tr',
  } as unknown as ReturnType<typeof usePrefs>)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

test('each row has Edit instead of the old Password button, and it opens the panel for that person', () => {
  render(<AdminTables vm={vm([person({ email: 'ayse@nove.group' })])} currentUserId="u-me" people={[]} />)
  expect(screen.queryByRole('button', { name: 'password' })).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: 'edit' }))
  // The new-user form above also has an "email" field; scope to the panel.
  const panel = screen.getByRole('group', { name: 'Ayşe edit' })
  expect((within(panel).getByLabelText('email') as HTMLInputElement).value).toBe('ayse@nove.group')
  // The panel gets its own full-width row instead of squeezing into the action cell.
  expect((panel.closest('td') as HTMLTableCellElement).colSpan).toBe(8)
  expect(panel.closest('tr')!.querySelectorAll('td')).toHaveLength(1)
})

test('someone who has not replaced a temporary password is marked as pending', () => {
  render(<AdminTables vm={vm([person({ role: 'executive', hasPassword: true, mustChangePassword: true })])} currentUserId="u-me" people={[]} />)
  expect(screen.getByText('passwordPending')).toBeTruthy()
})

test('while a generated password is on screen the Edit buttons stay disabled, so it cannot be lost', async () => {
  vi.mocked(updateUserAccount).mockResolvedValue({ ok: true, data: { id: 'u-ayse', tempPassword: 'Abcdefgh23456789' } } as never)
  render(<AdminTables vm={vm([person({})])} currentUserId="u-me" people={[]} />)

  fireEvent.click(screen.getByRole('button', { name: 'edit' }))
  const panel = screen.getByRole('group', { name: 'Ayşe edit' })
  fireEvent.change(within(panel).getByLabelText('thRole'), { target: { value: 'executive' } })
  fireEvent.change(within(panel).getByLabelText('email'), { target: { value: 'ayse@nove.group' } })
  fireEvent.click(within(panel).getByRole('button', { name: 'saveBtn' }))

  expect(await screen.findByText('Abcdefgh23456789')).toBeTruthy()
  expect((screen.getByRole('button', { name: 'edit' }) as HTMLButtonElement).disabled).toBe(true)

  fireEvent.click(screen.getByRole('button', { name: 'close' }))
  expect((screen.getByRole('button', { name: 'edit' }) as HTMLButtonElement).disabled).toBe(false)
})
