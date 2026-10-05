import { eq } from 'drizzle-orm'
import { expect, test } from 'vitest'
import { createTestDb } from '../index'
import { seed } from '../seed'
import { departments, keyResults, objectives, periods, users } from '../schema'

test('a department round-trips through the database', async () => {
  const db = await createTestDb()
  await db.insert(departments).values({
    id: 'test-dept',
    slug: 'test',
    emoji: '🧪',
    nameTr: 'Test Bölümü',
    nameEn: 'Test Department',
  })

  const rows = await db.select().from(departments)
  expect(rows).toHaveLength(1)
  expect(rows[0]?.nameTr).toBe('Test Bölümü')
})

test('key results keep fractional values intact', async () => {
  const db = await createTestDb()
  await db.insert(departments).values({
    id: 'd', slug: 'd', emoji: '🧪', nameTr: 'D', nameEn: 'D',
  })
  await db.insert(periods).values({
    id: 'p', code: '2026-Q3', state: 'active', startsOn: '2026-07-01', endsOn: '2026-09-30',
  })
  await db.insert(objectives).values({
    id: 'o', code: 'O1', departmentId: 'd', periodId: 'p', titleTr: 'T', titleEn: 'T',
  })
  await db.insert(keyResults).values({
    id: 'k', objectiveId: 'o', titleTr: 'K', titleEn: 'K',
    start: 5.2, current: 3.4, target: 2, unit: '%', confidence: 'mid',
  })

  const [kr] = await db.select().from(keyResults).where(eq(keyResults.id, 'k'))
  expect(kr?.start).toBe(5.2)
  expect(kr?.current).toBe(3.4)
})

test('deleting an objective cascades to its key results', async () => {
  const db = await createTestDb()
  await db.insert(departments).values({
    id: 'd', slug: 'd', emoji: '🧪', nameTr: 'D', nameEn: 'D',
  })
  await db.insert(periods).values({
    id: 'p', code: '2026-Q3', state: 'active', startsOn: '2026-07-01', endsOn: '2026-09-30',
  })
  await db.insert(objectives).values({
    id: 'o', code: 'O1', departmentId: 'd', periodId: 'p', titleTr: 'T', titleEn: 'T',
  })
  await db.insert(keyResults).values({
    id: 'k', objectiveId: 'o', titleTr: 'K', titleEn: 'K',
    start: 0, current: 1, target: 2,
  })

  await db.delete(objectives).where(eq(objectives.id, 'o'))
  expect(await db.select().from(keyResults)).toHaveLength(0)
})

test('email uniqueness is enforced by the database, not just the app', async () => {
  const db = await createTestDb()
  await db.insert(users).values({ id: 'u1', email: 'a@nove.group', name: 'A' })

  await expect(
    db.insert(users).values({ id: 'u2', email: 'a@nove.group', name: 'B' }),
  ).rejects.toThrow()
})

test('a person can exist without an email; addresses stay unique; null never matches', async () => {
  const db = await createTestDb()
  await seed(db)

  // Two people without an email: NULLs do not collide under the unique index.
  await db.insert(users).values({ id: 'u-ad-bir', name: 'Deneme Bir', email: null, role: 'staff', state: 'active' })
  await db.insert(users).values({ id: 'u-ad-iki', name: 'Deneme İki', email: null, role: 'staff', state: 'active' })

  // A taken address is still refused.
  const [someone] = await db.select().from(users).where(eq(users.id, 'u-kagan.ozturk'))
  await expect(
    db.insert(users).values({ id: 'u-kopya', name: 'Kopya', email: someone!.email, role: 'staff', state: 'active' }),
  ).rejects.toThrow()

  // Reporting line and title are stored.
  await db.update(users).set({ managerId: 'u-ad-bir', title: 'Uzman' }).where(eq(users.id, 'u-ad-iki'))
  const [two] = await db.select().from(users).where(eq(users.id, 'u-ad-iki'))
  expect(two).toMatchObject({ managerId: 'u-ad-bir', title: 'Uzman' })

  // The sign-in lookup is by email; an empty address must not find the null rows.
  expect(await db.select().from(users).where(eq(users.email, ''))).toEqual([])
})
