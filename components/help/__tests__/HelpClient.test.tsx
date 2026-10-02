import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { BUILTIN_HELP } from '@/lib/help/content'
import type { HelpArticle } from '@/lib/help/types'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import { HelpClient } from '../HelpClient'

vi.mock('next/navigation', () => ({ useRouter: vi.fn(() => ({ refresh: vi.fn() })) }))
vi.mock('@/lib/prefs/PrefsProvider', () => ({ usePrefs: vi.fn() }))
vi.mock('@/components/ui/ToastProvider', () => ({ useToast: vi.fn(() => vi.fn()) }))
// 'use server' actions; never called here.
vi.mock('@/lib/actions/help', () => ({
  createHelpArticle: vi.fn(),
  updateHelpArticle: vi.fn(),
  deleteHelpArticle: vi.fn(),
}))

afterEach(cleanup)

const note: HelpArticle = {
  id: 'n1',
  category: 'other',
  question: 'Bir çalışan işten ayrılınca ne yapmalıyım?',
  answer: 'Kişiyi silmeyin, **pasifleştirin**.',
  source: 'custom',
  authorName: 'Kağan Öztürk',
}

function renderIn(lang: 'tr' | 'en') {
  vi.mocked(usePrefs).mockReturnValue({ lang } as ReturnType<typeof usePrefs>)
  return render(<HelpClient articles={[...BUILTIN_HELP, note]} canManage />)
}

test('in English the screen, categories and built-in entries are English', () => {
  renderIn('en')
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('User guide')
  expect(screen.getByText(`${BUILTIN_HELP.length + 1} / ${BUILTIN_HELP.length + 1} questions`)).toBeTruthy()
  expect(screen.getByRole('button', { name: '+ Add question' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Account and password' })).toBeTruthy()
  expect(screen.getByText('Can I change the interface language?')).toBeTruthy()
  expect(screen.queryByText('Arayüz dilini değiştirebilir miyim?')).toBeNull()
  // The team note stays as written.
  expect(screen.getByText(note.question)).toBeTruthy()
  expect(screen.getByText('team note')).toBeTruthy()
})

test('opening an entry in English shows the English answer', () => {
  renderIn('en')
  fireEvent.click(screen.getByText('How do I change my own password?'))
  expect(screen.getByText(/the .* screen opens/)).toBeTruthy()
  expect(screen.getByText('Built-in guide — kept in the code, cannot be edited here.')).toBeTruthy()
})

test('English search finds English text, and a Turkish term still matches', () => {
  renderIn('en')
  const search = screen.getByLabelText('Search the guide')
  fireEvent.change(search, { target: { value: 'forgot password' } })
  expect(screen.getByText('I forgot my password. What should I do?')).toBeTruthy()
  fireEvent.change(search, { target: { value: 'parolamı unuttum' } })
  expect(screen.getByText('I forgot my password. What should I do?')).toBeTruthy()
  fireEvent.change(search, { target: { value: 'zzqx' } })
  expect(screen.getByText(/No results for “zzqx”/)).toBeTruthy()
})

test('in Turkish nothing changes', () => {
  renderIn('tr')
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Kullanım kılavuzu')
  expect(screen.getByText('Arayüz dilini değiştirebilir miyim?')).toBeTruthy()
  expect(screen.getByRole('button', { name: '+ Soru ekle' })).toBeTruthy()
})
