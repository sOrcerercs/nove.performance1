import { eq } from 'drizzle-orm'
import { afterEach, expect, test, vi } from 'vitest'
import { unstable_update } from '@/lib/auth/config'
import { requireUser } from '@/lib/auth/session'
import { createTestDb, getDb } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { seed } from '@/lib/db/seed'
import { changeOwnPassword } from '../admin'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth/session', () => ({ requireUser: vi.fn() }))
vi.mock('@/lib/auth/config', () => ({ unstable_update: vi.fn() }))
vi.mock('@/lib/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db')>()),
  getDb: vi.fn(),
}))

const ME = 'u-kagan.ozturk'

async function pending() {
  const db = await createTestDb()
  const { password } = await seed(db)
  await db.update(users).set({ mustChangePassword: true }).where(eq(users.id, ME))
  vi.mocked(getDb).mockResolvedValue(db)
  vi.mocked(requireUser).mockResolvedValue({ id: ME, name: 'K', email: 'k@nove.group', role: 'admin', departmentId: null })
  return { db, password }
}

afterEach(() => vi.clearAllMocks())

test('your own password can be changed while a temporary one is pending, and the token is refreshed', async () => {
  const { db, password } = await pending()
  const res = await changeOwnPassword({ currentPassword: password, newPassword: 'YeniParola2026!' })
  expect(res.ok).toBe(true)
  expect(requireUser).toHaveBeenCalledWith({ allowPendingPassword: true })
  expect(unstable_update).toHaveBeenCalledTimes(1)
  const [row] = await db.select().from(users).where(eq(users.id, ME))
  expect(row!.mustChangePassword).toBe(false)
})

test('a wrong current password leaves the token alone', async () => {
  await pending()
  const res = await changeOwnPassword({ currentPassword: 'yanlis-parola', newPassword: 'YeniParola2026!' })
  expect(res.ok).toBe(false)
  expect(unstable_update).not.toHaveBeenCalled()
})
