import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useRouter } from 'next/navigation'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { PrefsProvider } from '@/lib/prefs/PrefsProvider'
import { signInWithPassword } from '../actions'
import { LoginExperience } from '../login-experience'

/**
 * `../actions` is a `'use server'` module that pulls in next-auth, which
 * vitest cannot resolve, so it is stubbed. Reduced motion is switched on so
 * the phases change on short timers instead of animation frames, and the
 * canvas has no 2D context in jsdom — the component must cope with both.
 * The real PrefsProvider is used: the language choice is part of the flow.
 */

vi.mock('next/navigation', () => ({ useRouter: vi.fn() }))
vi.mock('../actions', () => ({ signInWithPassword: vi.fn() }))

const router = { replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }

beforeEach(() => {
  window.localStorage.clear()
  vi.mocked(useRouter).mockReturnValue(router as unknown as ReturnType<typeof useRouter>)
  window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null) as never
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderScreen(props: { welcomeName?: string } = {}) {
  return render(
    <PrefsProvider>
      <LoginExperience showSeedHint={false} {...props} />
    </PrefsProvider>,
  )
}

function fill(email: string, password: string, labels = { email: 'E-posta', password: 'Parola' }) {
  fireEvent.change(screen.getByLabelText(labels.email), { target: { value: email } })
  fireEvent.change(screen.getByLabelText(labels.password), { target: { value: password } })
  fireEvent.submit(screen.getByLabelText(labels.password).closest('form')!)
}

test('asks for both fields without calling the server', () => {
  renderScreen()
  fireEvent.click(screen.getByRole('button', { name: /giriş yap/i }))

  expect(screen.getByText('E-posta adresinizi yazın.')).toBeTruthy()
  expect(screen.getByText('Parolanızı yazın.')).toBeTruthy()
  expect(signInWithPassword).not.toHaveBeenCalled()
})

test('a refused sign-in brings the form back with the server message', async () => {
  vi.mocked(signInWithPassword).mockResolvedValue({ ok: false, code: 'invalid', remaining: 2, name: '' })
  renderScreen()
  fill('kagan.ozturk@nove.group', 'yanlis')

  expect((await screen.findByRole('alert')).textContent).toBe(
    'E-posta veya parola hatalı. 2 deneme hakkın kaldı.',
  )
  expect((screen.getByLabelText('Parola') as HTMLInputElement).disabled).toBe(false)
  expect(router.replace).not.toHaveBeenCalled()
})

test('greets by first name, then opens the home page when scrolled down', async () => {
  vi.mocked(signInWithPassword).mockResolvedValue({ ok: true, code: 'ok', name: 'Kağan Öztürk' })
  renderScreen()
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

test('English: the switch translates the screen, the messages and the welcome, and is remembered', async () => {
  vi.mocked(signInWithPassword)
    .mockResolvedValueOnce({ ok: false, code: 'locked', retryAfterMinutes: 15, name: '' })
    .mockResolvedValueOnce({ ok: true, code: 'ok', name: 'Kağan Öztürk' })
  const { container } = renderScreen()

  fireEvent.click(screen.getByRole('radio', { name: 'English' }))
  expect(screen.getByRole('radio', { name: 'English' }).getAttribute('aria-checked')).toBe('true')
  expect(screen.getByRole('heading', { name: 'Big goals grow in small steps.' })).toBeTruthy()
  // Without lang="en", Turkish casing would render SIGN IN as SİGN İN.
  expect(container.querySelector('[lang="en"]')).toBeTruthy()
  expect(JSON.parse(window.localStorage.getItem('nove-pys-prefs') ?? '{}').lang).toBe('en')

  const labels = { email: 'Email', password: 'Password' }
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
  expect(screen.getByText('Enter your email address.')).toBeTruthy()

  fill('kagan.ozturk@nove.group', 'x', labels)
  expect((await screen.findByRole('alert')).textContent).toBe(
    'Too many failed attempts. Try again in 15 minutes.',
  )

  fill('kagan.ozturk@nove.group', 'dogru', labels)
  await screen.findByRole('heading', { name: 'Welcome, Kağan.' })
  expect(screen.getByRole('button', { name: /scroll/i })).toBeTruthy()
})

test('opened from the sidebar it starts on the welcome screen, no form', async () => {
  renderScreen({ welcomeName: 'Yücel İskender' })

  expect(screen.getByRole('heading', { name: 'Hoş geldin, Yücel.' })).toBeTruthy()
  expect(screen.queryByLabelText('Parola')).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: /kaydır/i }))
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'))
})

test('the form says where to go when a password is forgotten', () => {
  renderScreen()
  expect(screen.getByText('Parolanı mı unuttun? Yöneticine başvur.')).toBeTruthy()
})
