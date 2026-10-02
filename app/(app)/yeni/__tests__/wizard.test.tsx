import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useRouter } from 'next/navigation'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createObjective } from '@/lib/actions/objectives'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import { Wizard } from '../wizard'

/**
 * Regression: the wizard never asked for a rollup rule, so every key result it
 * created silently became `last` and a cumulative target ("750 new reviews")
 * showed only its latest month. The rule is now an explicit, required choice.
 */

vi.mock('next/navigation', () => ({ useRouter: vi.fn() }))
vi.mock('@/lib/prefs/PrefsProvider', () => ({ usePrefs: vi.fn() }))
vi.mock('@/components/ui/ToastProvider', () => ({ useToast: vi.fn(() => vi.fn()) }))
vi.mock('@/lib/actions/objectives', () => ({ createObjective: vi.fn() }))

beforeEach(() => {
  vi.mocked(useRouter).mockReturnValue(
    { push: vi.fn(), refresh: vi.fn() } as unknown as ReturnType<typeof useRouter>,
  )
  vi.mocked(usePrefs).mockReturnValue({
    t: ((key: string) => key) as never,
    lang: 'tr',
  } as unknown as ReturnType<typeof usePrefs>)
  vi.mocked(createObjective).mockResolvedValue({ ok: true, data: { id: 'o-new', deptSlug: 'misafir' } })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

test('a key result needs an explicit rule, and the chosen rule is what gets saved', async () => {
  render(
    <Wizard
      depts={[{ id: 'misafir', emoji: '🏨', nameTr: 'Misafir Deneyimi', nameEn: 'Hospitality' }]}
      defaultDeptId="misafir"
      periodCode="2026-FY"
      people={[]}
    />,
  )
  fireEvent.change(screen.getByPlaceholderText('phObjective'), { target: { value: 'Misafir yorumlarını artır' } })
  fireEvent.click(screen.getByText(/step2 →/))
  fireEvent.change(screen.getByLabelText('fieldKr 1'), { target: { value: '750 yeni 5 yıldızlı yorum' } })

  const save = screen.getByRole('button', { name: 'save' }) as HTMLButtonElement
  expect(save.disabled).toBe(true)
  expect(screen.getByText('ruleMissing')).toBeTruthy()

  fireEvent.change(screen.getByLabelText('fieldKr 1 fieldRollup'), { target: { value: 'sum' } })
  expect(save.disabled).toBe(false)

  fireEvent.click(save)
  await waitFor(() => expect(createObjective).toHaveBeenCalled())
  expect(vi.mocked(createObjective).mock.calls[0]![0].krs).toEqual([
    expect.objectContaining({ title: '750 yeni 5 yıldızlı yorum', rollup: 'sum' }),
  ])
})
