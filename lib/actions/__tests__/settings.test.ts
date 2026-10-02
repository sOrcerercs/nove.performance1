import { expect, test } from 'vitest'
import type { SessionUser } from '@/lib/auth/permissions'
import { createTestDb } from '@/lib/db'
import { seed } from '@/lib/db/seed'
import { resolveRange } from '@/lib/queries/range'
import { DEFAULT_RANGE_START, getDefaultRangeStart } from '@/lib/queries/settings'
import { withRequestScope } from '@/lib/queries/tables'
import { setDefaultRangeStartAs } from '../core/settings'

const admin: SessionUser = {
  id: 'u-admin', name: 'Admin', email: 'admin@example.com', role: 'admin', departmentId: null,
}
const executive: SessionUser = { ...admin, id: 'u-exec', role: 'executive' }

async function seeded() {
  const db = await createTestDb()
  await seed(db)
  return db
}

test('with nothing stored the default start is 1 September 2025', async () => {
  const db = await seeded()
  expect(DEFAULT_RANGE_START).toBe('2025-09-01')
  expect(await withRequestScope(() => getDefaultRangeStart(db))).toBe('2025-09-01')
})

test('an admin can move the default start', async () => {
  const db = await seeded()
  const result = await setDefaultRangeStartAs(db, admin, { startsOn: '2026-09-01' })
  expect(result.ok).toBe(true)
  expect(await withRequestScope(() => getDefaultRangeStart(db))).toBe('2026-09-01')
})

test('writing twice updates the row rather than adding one', async () => {
  const db = await seeded()
  await setDefaultRangeStartAs(db, admin, { startsOn: '2026-09-01' })
  await setDefaultRangeStartAs(db, admin, { startsOn: '2027-09-01' })
  expect(await withRequestScope(() => getDefaultRangeStart(db))).toBe('2027-09-01')
})

test('an executive may not change it', async () => {
  const db = await seeded()
  const result = await setDefaultRangeStartAs(db, executive, { startsOn: '2026-09-01' })
  expect(result).toEqual({
    ok: false,
    error: { tr: 'Bu işlem için yetkiniz yok.', en: "You don't have permission to do this." },
  })
  expect(await withRequestScope(() => getDefaultRangeStart(db))).toBe('2025-09-01')
})

test('a malformed or impossible date is rejected', async () => {
  const db = await seeded()
  expect((await setDefaultRangeStartAs(db, admin, { startsOn: '01.09.2026' })).ok).toBe(false)
  expect((await setDefaultRangeStartAs(db, admin, { startsOn: '2026-02-30' })).ok).toBe(false)
  expect(await withRequestScope(() => getDefaultRangeStart(db))).toBe('2025-09-01')
})

test('a stored value that is not a real date falls back rather than breaking the app', async () => {
  const db = await seeded()
  const { appSettings } = await import('@/lib/db/schema')
  await db.insert(appSettings).values({ key: 'default_range_start', value: 'bozuk' })
  expect(await withRequestScope(() => getDefaultRangeStart(db))).toBe('2025-09-01')
})

test('moving the default start changes what the app opens on', async () => {
  const db = await seeded()
  const now = new Date('2026-06-15T12:00:00Z')

  const before = await withRequestScope(() => resolveRange(db, undefined, now))
  expect(before.range.from).toBe('2025-09-01')

  const result = await setDefaultRangeStartAs(db, admin, { startsOn: '2026-01-01' })
  expect(result.ok).toBe(true)

  const after = await withRequestScope(() => resolveRange(db, undefined, now))
  expect(after.range.from).toBe('2026-01-01')
})
