import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useRouter } from 'next/navigation'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { changeOwnPassword } from '@/lib/actions/admin'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import { ForcedPasswordChange } from '../forced-password-change'

vi.mock('next/navigation', () => ({ useRouter: vi.fn() }))
vi.mock('@/lib/prefs/PrefsProvider', () => ({ usePrefs: vi.fn() }))
vi.mock('@/lib/actions/admin', () => ({ changeOwnPassword: vi.fn() }))
vi.mock('@/components/shell/actions', () => ({ signOutAction: vi.fn() }))

const router = { replace: vi.fn(), refresh: vi.fn() }

beforeEach(() => {
  vi.mocked(useRouter).mockReturnValue(router as unknown as ReturnType<typeof useRouter>)
  vi.mocked(usePrefs).mockReturnValue({
    t: ((key: string) => key) as never,
    lang: 'tr',
  } as unknown as ReturnType<typeof usePrefs>)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function submit(current: string, next: string) {
  fireEvent.change(screen.getByLabelText('currentPassword'), { target: { value: current } })
  fireEvent.change(screen.getByLabelText('newPassword'), { target: { value: next } })
  fireEvent.change(screen.getByLabelText('newPasswordAgain'), { target: { value: next } })
  fireEvent.click(screen.getByRole('button', { name: 'updatePassword' }))
}

test('after the new password is saved the screen confirms it and Continue goes home', async () => {
  vi.mocked(changeOwnPassword).mockResolvedValue({ ok: true, data: { id: 'u1' } })
  render(<ForcedPasswordChange name="Ayşe" />)
  submit('GeciciSifre2345', 'YeniParola2026!')

  expect(await screen.findByRole('status')).toBeTruthy()
  expect(changeOwnPassword).toHaveBeenCalledWith({ currentPassword: 'GeciciSifre2345', newPassword: 'YeniParola2026!' })
  fireEvent.click(screen.getByRole('button', { name: 'continueBtn' }))
  expect(router.replace).toHaveBeenCalledWith('/')
})

test('a refusal keeps the form and shows the reason', async () => {
  vi.mocked(changeOwnPassword).mockResolvedValue({ ok: false, error: { tr: 'Mevcut parola hatalı.', en: 'x' } })
  render(<ForcedPasswordChange name="Ayşe" />)
  submit('yanlis', 'YeniParola2026!')

  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Mevcut parola hatalı.')
  expect(screen.queryByRole('button', { name: 'continueBtn' })).toBeNull()
})
