import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useRouter } from 'next/navigation'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { setObjectiveWeights } from '@/lib/actions/objective-weights'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import type { ObjectiveVm } from '@/lib/queries/department'
import { ObjectiveWeightsPanel } from '../ObjectiveWeightsPanel'

vi.mock('next/navigation', () => ({ useRouter: vi.fn() }))
vi.mock('@/lib/prefs/PrefsProvider', () => ({ usePrefs: vi.fn() }))
vi.mock('@/components/ui/ToastProvider', () => ({ useToast: vi.fn(() => vi.fn()) }))
vi.mock('@/lib/actions/objective-weights', () => ({ setObjectiveWeights: vi.fn() }))

const refresh = vi.fn()
beforeEach(() => {
  vi.mocked(useRouter).mockReturnValue({ push: vi.fn(), refresh } as unknown as ReturnType<typeof useRouter>)
  vi.mocked(usePrefs).mockReturnValue({
    t: ((key: string) => key) as never,
    lang: 'tr',
  } as unknown as ReturnType<typeof usePrefs>)
  vi.mocked(setObjectiveWeights).mockResolvedValue({ ok: true, data: { deptSlug: 'satis' } })
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const obj = (id: string, code: string, weight: number | null, periodId = 'p1'): ObjectiveVm => ({
  id, code, weight, periodId,
  ownerUserId: null, titleTr: `Hedef ${code}`, titleEn: `Goal ${code}`, ownerName: '', pct: 0, krs: [],
})
const PERIODS = [{ id: 'p1', code: '2026-FY', weightState: 'none' as const }]

function openPanel(objectives: ObjectiveVm[]) {
  render(<ObjectiveWeightsPanel deptId="satis" periods={PERIODS} objectives={objectives} />)
  fireEvent.click(screen.getByRole('button', { name: 'objectiveWeights' }))
}
const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement
const save = () => screen.getByRole('button', { name: 'save' }) as HTMLButtonElement

test('closed by default; opening lists each objective with its current weight', () => {
  openPanel([obj('o1', 'O1', 30), obj('o2', 'O2', 70)])
  expect(input('O1 · Hedef O1').value).toBe('30')
  expect(input('O2 · Hedef O2').value).toBe('70')
})

test('there is no split-evenly button', () => {
  openPanel([obj('o1', 'O1', null), obj('o2', 'O2', null)])
  expect(screen.queryByRole('button', { name: 'weightEqual' })).toBeNull()
})

test('save waits for a total of exactly 100, then sends the whole set', async () => {
  openPanel([obj('o1', 'O1', null), obj('o2', 'O2', null)])
  fireEvent.change(input('O1 · Hedef O1'), { target: { value: '60' } })
  fireEvent.change(input('O2 · Hedef O2'), { target: { value: '30' } })
  expect(save().disabled).toBe(true)
  fireEvent.change(input('O2 · Hedef O2'), { target: { value: '40' } })
  expect(save().disabled).toBe(false)
  fireEvent.click(save())
  await waitFor(() => expect(setObjectiveWeights).toHaveBeenCalledWith({
    departmentId: 'satis',
    periodId: 'p1',
    weights: [{ objectiveId: 'o1', weight: 60 }, { objectiveId: 'o2', weight: 40 }],
  }))
  await waitFor(() => expect(refresh).toHaveBeenCalled())
})

test('a partial set cannot be saved; clearing everything can', () => {
  openPanel([obj('o1', 'O1', 30), obj('o2', 'O2', 70)])
  fireEvent.change(input('O2 · Hedef O2'), { target: { value: '' } })
  expect(save().disabled).toBe(true)
  fireEvent.change(input('O1 · Hedef O1'), { target: { value: '' } })
  expect(save().disabled).toBe(false)
})

test("the server's refusal is shown in the panel", async () => {
  vi.mocked(setObjectiveWeights).mockResolvedValue({
    ok: false, error: { tr: 'Objective listesi değişmiş, sayfayı yenileyin.', en: 'reload' },
  })
  openPanel([obj('o1', 'O1', 100)])
  fireEvent.click(save())
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Objective listesi değişmiş, sayfayı yenileyin.')
})

test('one form per period, each with only its own objectives', () => {
  render(
    <ObjectiveWeightsPanel
      deptId="satis"
      periods={[...PERIODS, { id: 'p2', code: '2027-FY', weightState: 'none' }]}
      objectives={[obj('o1', 'O1', null, 'p1'), obj('o9', 'O9', null, 'p2')]}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'objectiveWeights' }))
  expect(screen.getAllByRole('button', { name: 'save' })).toHaveLength(2)
  expect(screen.getByRole('region', { name: '2026-FY' })).toBeTruthy()
  expect(screen.getByRole('region', { name: '2027-FY' })).toBeTruthy()
})

test('renders nothing when the department has no objectives', () => {
  const { container } = render(<ObjectiveWeightsPanel deptId="satis" periods={PERIODS} objectives={[]} />)
  expect(container.innerHTML).toBe('')
})
