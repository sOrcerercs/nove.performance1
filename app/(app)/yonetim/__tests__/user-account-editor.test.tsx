import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { updateUserAccount } from '@/lib/actions/admin'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import { UserAccountEditor, type EditableUser } from '../user-account-editor'

vi.mock('@/lib/prefs/PrefsProvider', () => ({ usePrefs: vi.fn() }))
vi.mock('@/lib/actions/admin', () => ({ updateUserAccount: vi.fn() }))

const staff: EditableUser = { id: 'u-ayse', name: 'Ayşe', email: null, role: 'staff', hasPassword: false }
const account: EditableUser = { id: 'u-ali', name: 'Ali', email: 'ali@nove.group', role: 'executive', hasPassword: true }
const TEMP = 'Abcdefgh23456789'

beforeEach(() => {
  vi.mocked(usePrefs).mockReturnValue({
    t: ((key: string) => key) as never,
    lang: 'tr',
  } as unknown as ReturnType<typeof usePrefs>)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const checkbox = () => screen.queryByRole('checkbox', { name: /tempPasswordIssue/ }) as HTMLInputElement | null

test('staff are offered no password; promoting one ticks and locks the temporary password', () => {
  render(<UserAccountEditor user={staff} isSelf={false} onDone={vi.fn()} onCancel={vi.fn()} />)
  expect(checkbox()).toBeNull()

  fireEvent.change(screen.getByLabelText('thRole'), { target: { value: 'executive' } })
  expect(checkbox()!.checked).toBe(true)
  expect(checkbox()!.disabled).toBe(true)
})

test('the generated password is shown once with Copy, and Close removes it', async () => {
  vi.mocked(updateUserAccount).mockResolvedValue({ ok: true, data: { id: 'u-ayse', tempPassword: TEMP } })
  const onDone = vi.fn()
  render(<UserAccountEditor user={staff} isSelf={false} onDone={onDone} onCancel={vi.fn()} />)

  fireEvent.change(screen.getByLabelText('email'), { target: { value: ' ayse@nove.group ' } })
  fireEvent.change(screen.getByLabelText('thRole'), { target: { value: 'executive' } })
  fireEvent.click(screen.getByRole('button', { name: 'saveBtn' }))

  expect(await screen.findByText(TEMP)).toBeTruthy()
  expect(updateUserAccount).toHaveBeenCalledWith({
    userId: 'u-ayse', email: 'ayse@nove.group', role: 'executive', issueTempPassword: true,
  })
  expect(screen.getByRole('button', { name: 'copy' })).toBeTruthy()
  expect(onDone).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('button', { name: 'close' }))
  expect(onDone).toHaveBeenCalledTimes(1)
  expect(screen.queryByText(TEMP)).toBeNull()
})

test('an existing account may be reset, but is not by default', async () => {
  vi.mocked(updateUserAccount).mockResolvedValue({ ok: true, data: { id: 'u-ali', tempPassword: null } })
  const onDone = vi.fn()
  render(<UserAccountEditor user={account} isSelf={false} onDone={onDone} onCancel={vi.fn()} />)
  expect(checkbox()!.checked).toBe(false)
  expect(checkbox()!.disabled).toBe(false)

  fireEvent.click(screen.getByRole('button', { name: 'saveBtn' }))
  await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
  expect(updateUserAccount).toHaveBeenCalledWith({
    userId: 'u-ali', email: 'ali@nove.group', role: 'executive', issueTempPassword: false,
  })
})

test('your own row offers no temporary password', () => {
  render(<UserAccountEditor user={{ ...account, role: 'admin' }} isSelf onDone={vi.fn()} onCancel={vi.fn()} />)
  expect(checkbox()).toBeNull()
})

test('a refusal is shown in the chosen language and the panel stays open', async () => {
  vi.mocked(updateUserAccount).mockResolvedValue({ ok: false, error: { tr: 'Bu e-posta zaten kayıtlı.', en: 'x' } })
  const onDone = vi.fn()
  render(<UserAccountEditor user={account} isSelf={false} onDone={onDone} onCancel={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'saveBtn' }))
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Bu e-posta zaten kayıtlı.')
  expect(onDone).not.toHaveBeenCalled()
})
