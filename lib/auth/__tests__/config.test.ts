import { eq } from 'drizzle-orm'
import { expect, test, vi } from 'vitest'
import { createTestDb, getDb } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { seed } from '@/lib/db/seed'

const captured = vi.hoisted(() => ({ config: undefined as undefined | { callbacks: Record<string, Function> } }))

vi.mock('next-auth', () => ({
  default: (config: { callbacks: Record<string, Function> }) => {
    captured.config = config
    return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn(), unstable_update: vi.fn() }
  },
}))
vi.mock('next-auth/providers/credentials', () => ({ default: (o: unknown) => o }))
vi.mock('@/lib/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db')>()),
  getDb: vi.fn(),
}))

test('sign-in puts the flag on the token; an update re-reads it from the database, not from the request', async () => {
  const db = await createTestDb()
  await seed(db)
  vi.mocked(getDb).mockResolvedValue(db)
  await import('../config')
  const { jwt, session } = captured.config!.callbacks

  const token = await jwt!({
    token: {},
    user: { id: 'u-kagan.ozturk', role: 'admin', departmentId: null, mustChangePassword: true },
  })
  expect(token.mustChangePassword).toBe(true)
  const s = session!({ session: { user: {} }, token })
  expect(s.user.mustChangePassword).toBe(true)

  // The browser can POST any payload to /api/auth/session; it must not clear the flag.
  await db.update(users).set({ mustChangePassword: true }).where(eq(users.id, 'u-kagan.ozturk'))
  const forged = await jwt!({ token: { ...token }, trigger: 'update', session: { user: { mustChangePassword: false } } })
  expect(forged.mustChangePassword).toBe(true)

  await db.update(users).set({ mustChangePassword: false }).where(eq(users.id, 'u-kagan.ozturk'))
  const cleared = await jwt!({ token: { ...token }, trigger: 'update', session: {} })
  expect(cleared.mustChangePassword).toBe(false)
})
