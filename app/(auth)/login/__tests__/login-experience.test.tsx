import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useRouter } from 'next/navigation'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { signInWithPassword } from '../actions'
import { LoginExperience } from '../login-experience'

/**
 * `../actions` is a `'use server'` module that pulls in next-auth, which
 * vitest cannot resolve, so it is stubbed. Reduced motion is switched on so
 * the phases change on short timers instead of animation frames, and the
 * canvas has no 2D context in jsdom — the component must cope with both.
 */

vi.mock('next/navigation', () => ({ useRouter: vi.fn() }))
vi.mock('../actions', () => ({ signInWithPassword: vi.fn() }))

const router = { replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }

beforeEach(() => {
  vi.mocked(useRouter).mockReturnValue(router as unknown as ReturnType<typeof useRouter>)
  window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null) as never
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function fill(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('E-posta'), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('Parola'), { target: { value: password } })
  fireEvent.click(screen.getByRole('button', { name: /giriş yap/i }))
}

test('asks for both fields without calling the server', () => {
  render(<LoginExperience showSeedHint={false} />)
  fireEvent.click(screen.getByRole('button', { name: /giriş yap/i }))

  expect(screen.getByText('E-posta adresinizi yazın.')).toBeTruthy()
  expect(screen.getByText('Parolanızı yazın.')).toBeTruthy()
  expect(signInWithPassword).not.toHaveBeenCalled()
})

test('a refused sign-in brings the form back with the server message', async () => {
  vi.mocked(signInWithPassword).mockResolvedValue({
    ok: false,
    error: 'E-posta veya parola hatalı.',
    name: '',
  })
  render(<LoginExperience showSeedHint={false} />)
  fill('kagan.ozturk@nove.group', 'yanlis')

  expect((await screen.findByRole('alert')).textContent).toBe('E-posta veya parola hatalı.')
  expect((screen.getByLabelText('Parola') as HTMLInputElement).disabled).toBe(false)
  expect(router.replace).not.toHaveBeenCalled()
})

test('greets by first name, then opens the home page when scrolled down', async () => {
  vi.mocked(signInWithPassword).mockResolvedValue({ ok: true, error: '', name: 'Kağan Öztürk' })
  render(<LoginExperience showSeedHint={false} />)
  fill(' kagan.ozturk@nove.group ', 'dogru')

  await screen.findByRole('heading', { name: 'Hoş geldin, Kağan.' })
  expect(signInWithPassword).toHaveBeenCalledWith({
    email: 'kagan.ozturk@nove.group',
    password: 'dogru',
  })
  expect(router.replace).not.toHaveBeenCalled()

  // The first moments are ignored so a still-scrolling trackpad cannot skip
  // the welcome screen.
  await new Promise((r) => setTimeout(r, 650))
  fireEvent.wheel(window, { deltaY: 120 })

  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'))
  expect(router.refresh).toHaveBeenCalled()
})

test('opened from the sidebar it starts on the welcome screen, no form', async () => {
  render(<LoginExperience showSeedHint={false} welcomeName="Yücel İskender" />)

  expect(screen.getByRole('heading', { name: 'Hoş geldin, Yücel.' })).toBeTruthy()
  expect(screen.queryByLabelText('Parola')).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: /kaydır/i }))
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'))
})
