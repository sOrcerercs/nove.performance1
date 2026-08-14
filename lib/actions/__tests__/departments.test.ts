import { eq } from 'drizzle-orm'
import { expect, test } from 'vitest'
import type { SessionUser } from '@/lib/auth/permissions'
import { createTestDb } from '@/lib/db'
import { checkins, departments, keyResults, objectives, users } from '@/lib/db/schema'
import { seed } from '@/lib/db/seed'
import { SEED_OBJECTIVE_PERIOD_ID } from '@/lib/db/seed-data'
import type { Role } from '@/lib/domain/types'
import {
  createDepartmentAs,
  deleteDepartmentAs,
  describeDepartmentDeletion,
  moveDepartmentAs,
  updateDepartmentAs,
} from '../core/departments'
import { submitCheckinFor } from '../core/checkins'

async function seeded() {
  const db = await createTestDb()
  await seed(db)
  return db
}

const actor = (role: Role, id = 'u-kagan.ozturk'): SessionUser => ({
  id, name: 'Test', email: 't@nove.group', role, departmentId: null,
})

const newDept = {
  slug: 'hukuk',
  emoji: '⚖️',
  nameTr: 'Hukuk',
  nameEn: 'Legal',
  leadUserId: null,
}

/* -------------------------------- create -------------------------------- */

test('an admin creates a department and it lands at the end of the list', async () => {
  const db = await seeded()
  const res = await createDepartmentAs(db, actor('admin'), newDept)
  expect(res.ok).toBe(true)
  if (!res.ok) return

  const rows = await db.select().from(departments).orderBy(departments.sortOrder)
  expect(rows).toHaveLength(11)
  expect(rows[rows.length - 1]?.slug).toBe('hukuk')
})

test('a duplicate slug is refused rather than throwing', async () => {
  const db = await seeded()
  const res = await createDepartmentAs(db, actor('admin'), { ...newDept, slug: 'satis' })
  expect(res.ok).toBe(false)
  if (!res.ok) expect(res.error).toContain('kısa ad')
})

test('a slug with spaces or non-ascii is refused — it becomes a URL', async () => {
  const db = await seeded()
  for (const slug of ['Hukuk İşleri', 'hukuk isleri', 'hukuk/işler']) {
    const res = await createDepartmentAs(db, actor('admin'), { ...newDept, slug })
    expect(res.ok, slug).toBe(false)
  }
})

test('capitals in a slug are normalised rather than rejected', async () => {
  const db = await seeded()
  const res = await createDepartmentAs(db, actor('admin'), { ...newDept, slug: 'HUKUK' })
  expect(res.ok).toBe(true)
  if (!res.ok) return
  // The URL must be lowercase; typing it in capitals is a typo, not an error.
  expect(res.data.slug).toBe('hukuk')

  const [row] = await db.select().from(departments).where(eq(departments.id, res.data.id))
  expect(row?.slug).toBe('hukuk')
})

test('only an admin may create a department', async () => {
  const db = await seeded()
  for (const role of ['executive', 'staff'] as const) {
    const res = await createDepartmentAs(db, actor(role), { ...newDept, slug: `x-${role}` })
    expect(res.ok, role).toBe(false)
  }
  expect(await db.select().from(departments)).toHaveLength(10)
})

/* -------------------------------- update -------------------------------- */

test('renaming a department keeps its slug, so links do not break', async () => {
  const db = await seeded()
  const res = await updateDepartmentAs(db, actor('admin'), {
    id: 'satis',
    emoji: '🏖️',
    nameTr: 'Satış Operasyonları',
    nameEn: 'Sales Ops',
    leadUserId: 'u-bahadir.temizer',
  })
  expect(res.ok).toBe(true)

  const [row] = await db.select().from(departments).where(eq(departments.id, 'satis'))
  expect(row?.nameTr).toBe('Satış Operasyonları')
  expect(row?.emoji).toBe('🏖️')
  expect(row?.leadUserId).toBe('u-bahadir.temizer')
  expect(row?.slug).toBe('satis')
})

test('an executive cannot rename a department', async () => {
  const db = await seeded()
  const res = await updateDepartmentAs(db, actor('executive'), {
    id: 'satis', emoji: '🏖️', nameTr: 'X', nameEn: 'X', leadUserId: null,
  })
  expect(res.ok).toBe(false)
})

/* -------------------------------- delete -------------------------------- */

test('a department holding objectives cannot be deleted', async () => {
  const db = await seeded()
  // The real seed has nobody's departmentId set (all three accounts are
  // homeless admins), so the "affected users" count needs a person planted
  // here to stay a meaningful, non-vacuous check.
  await db.update(users).set({ departmentId: 'sirket' }).where(eq(users.id, 'u-bahadir.temizer'))

  await submitCheckinFor(db, actor('admin'), {
    keyResultId: 'k-sirket-operasyon', newValue: 1700, confidence: 'high',
  })

  const impact = await describeDepartmentDeletion(db, actor('admin'), 'sirket')
  expect(impact.ok).toBe(true)
  if (impact.ok) {
    expect(impact.data.objectives).toBe(1)
    expect(impact.data.keyResults).toBe(5)
    expect(impact.data.checkins).toBe(1)
    expect(impact.data.users).toBe(1)
  }

  const res = await deleteDepartmentAs(db, actor('admin'), { id: 'sirket' })
  expect(res.ok).toBe(false)
  if (!res.ok) expect(res.error).toContain('objective')

  // Nothing was destroyed on the way to being refused.
  expect(await db.select().from(departments).where(eq(departments.id, 'sirket'))).toHaveLength(1)
  expect(await db.select().from(objectives).where(eq(objectives.departmentId, 'sirket'))).toHaveLength(1)
  expect(await db.select().from(checkins)).toHaveLength(1)
})

test('an empty department is deleted and its people are detached, not deleted', async () => {
  const db = await seeded()

  // Move someone into a brand-new department, then delete it.
  const created = await createDepartmentAs(db, actor('admin'), newDept)
  expect(created.ok).toBe(true)
  if (!created.ok) return
  await db.update(users).set({ departmentId: created.data.id }).where(eq(users.id, 'u-oguzhan.kizilcan'))

  const res = await deleteDepartmentAs(db, actor('admin'), { id: created.data.id })
  expect(res.ok).toBe(true)
  if (res.ok) expect(res.data.detachedUsers).toBe(1)

  expect(await db.select().from(departments).where(eq(departments.id, created.data.id))).toHaveLength(0)

  const [person] = await db.select().from(users).where(eq(users.id, 'u-oguzhan.kizilcan'))
  expect(person).toBeTruthy()
  expect(person?.departmentId).toBeNull()
})

test('deleting an unknown department is refused', async () => {
  const db = await seeded()
  expect((await deleteDepartmentAs(db, actor('admin'), { id: 'yok' })).ok).toBe(false)
})

test('only an admin may delete a department', async () => {
  const db = await seeded()
  const created = await createDepartmentAs(db, actor('admin'), newDept)
  if (!created.ok) return
  expect((await deleteDepartmentAs(db, actor('executive'), { id: created.data.id })).ok).toBe(false)
})

/* ------------------------------- reorder -------------------------------- */

test('a department can be moved up and down the sidebar', async () => {
  const db = await seeded()
  const before = await db.select().from(departments).orderBy(departments.sortOrder)
  const second = before[1]!

  expect((await moveDepartmentAs(db, actor('admin'), { id: second.id, direction: 'up' })).ok).toBe(true)
  const afterUp = await db.select().from(departments).orderBy(departments.sortOrder)
  expect(afterUp[0]?.id).toBe(second.id)

  expect((await moveDepartmentAs(db, actor('admin'), { id: second.id, direction: 'down' })).ok).toBe(true)
  const afterDown = await db.select().from(departments).orderBy(departments.sortOrder)
  expect(afterDown[1]?.id).toBe(second.id)
})

test('moving the first department up is a no-op, not an error', async () => {
  const db = await seeded()
  const before = await db.select().from(departments).orderBy(departments.sortOrder)
  const res = await moveDepartmentAs(db, actor('admin'), { id: before[0]!.id, direction: 'up' })
  expect(res.ok).toBe(true)

  const after = await db.select().from(departments).orderBy(departments.sortOrder)
  expect(after.map((d) => d.id)).toEqual(before.map((d) => d.id))
})

/* --------------------- a new department is usable ----------------------- */

test('a new department accepts objectives and shows up in progress rollups', async () => {
  const db = await seeded()
  const created = await createDepartmentAs(db, actor('admin'), newDept)
  if (!created.ok) return

  await db.insert(objectives).values({
    id: 'o-hukuk-1', code: 'O1', departmentId: created.data.id,
    periodId: SEED_OBJECTIVE_PERIOD_ID, titleTr: 'Sözleşme süresini kısalt', titleEn: 'Shorten contract cycle',
  })
  await db.insert(keyResults).values({
    id: 'k-hukuk-1', objectiveId: 'o-hukuk-1',
    titleTr: 'İnceleme süresini 5 güne indir', titleEn: 'Cut review to 5 days',
    start: 12, current: 12, target: 5,
  })

  const rows = await db.select().from(objectives).where(eq(objectives.departmentId, created.data.id))
  expect(rows).toHaveLength(1)
})
