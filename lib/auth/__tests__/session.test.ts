import { redirect } from 'next/navigation'
import { afterEach, expect, test, vi } from 'vitest'
import { auth } from '../config'
import { requirePendingPasswordUser, requireUser } from '../session'

vi.mock('next/navigation', () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect:${to}`)
  }),
}))
vi.mock('../config', () => ({ auth: vi.fn() }))

const signedIn = (extra: Record<string, unknown> = {}) => ({
  user: { id: 'u1', name: 'A', email: 'a@nove.group', role: 'admin', departmentId: null, ...extra },
  expires: '',
})
const authReturns = (value: unknown) =>
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(value)

afterEach(() => vi.clearAllMocks())

test('a pending temporary password sends every page and action to the change screen', async () => {
  authReturns(signedIn({ mustChangePassword: true }))
  await expect(requireUser()).rejects.toThrow('redirect:/sifre-degistir')
})

test('the change screen and its action are let through while it is pending', async () => {
  authReturns(signedIn({ mustChangePassword: true }))
  await expect(requireUser({ allowPendingPassword: true })).resolves.toMatchObject({ id: 'u1' })
})

test('a token from before this change carries no flag and is not redirected', async () => {
  authReturns(signedIn())
  await expect(requireUser()).resolves.toEqual({
    id: 'u1', name: 'A', email: 'a@nove.group', role: 'admin', departmentId: null,
  })
  expect(redirect).not.toHaveBeenCalled()
})

test('the change screen sends someone with nothing pending home, and no session to the login', async () => {
  authReturns(signedIn({ mustChangePassword: false }))
  await expect(requirePendingPasswordUser()).rejects.toThrow(/^redirect:\/$/)
  authReturns(null)
  await expect(requirePendingPasswordUser()).rejects.toThrow(/^redirect:\/login$/)
  await expect(requireUser()).rejects.toThrow(/^redirect:\/login$/)
})
