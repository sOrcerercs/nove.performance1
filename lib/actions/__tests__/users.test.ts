import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { expect, test } from 'vitest'
import type { SessionUser } from '@/lib/auth/permissions'
import { createTestDb } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { seed } from '@/lib/db/seed'
import type { Role } from '@/lib/domain/types'
import {
  changeOwnPasswordAs,
  createUserAs,
  deleteUserAs,
  setUserPasswordAs,
  setUserRoleAs,
  setUserStateAs,
} from '../core/users'

async function seeded() {
  const db = await createTestDb()
  await seed(db)
  return db
}

/** The seed password is generated per run, so tests must capture it. */
async function seededWithPassword() {
  const db = await createTestDb()
  const { password } = await seed(db)
  return { db, password }
}

const ADMIN_ID = 'u-elif.cinar'
const OTHER_ADMIN_ID = 'u-nazli.er'

const actor = (role: Role, id = ADMIN_ID): SessionUser => ({
  id, name: 'Test', email: 't@nove.group', role, departmentId: 'ik',
})

const NEW_PASSWORD = 'YeniParola2026!'

/* -------------------------------- create -------------------------------- */

test('an admin creates an account with a hashed password', async () => {
  const db = await seeded()
  const res = await createUserAs(db, actor('admin'), {
    name: 'Yeni Yönetici', email: 'yeni@nove.group', role: 'admin',
    departmentId: 'ik', password: NEW_PASSWORD,
  })
  expect(res.ok).toBe(true)
  if (!res.ok) return

  const [row] = await db.select().from(users).where(eq(users.id, res.data.id))
  expect(row?.email).toBe('yeni@nove.group')
  expect(row?.passwordHash).toBeTruthy()
  expect(row?.passwordHash).not.toBe(NEW_PASSWORD)
  expect(await bcrypt.compare(NEW_PASSWORD, row?.passwordHash ?? '')).toBe(true)
})

test('a staff record is created without any credential', async () => {
  const db = await seeded()
  const res = await createUserAs(db, actor('admin'), {
    name: 'Yeni Personel', email: 'personel@nove.group', role: 'staff', departmentId: 'saha',
  })
  expect(res.ok).toBe(true)
  if (!res.ok) return

  const [row] = await db.select().from(users).where(eq(users.id, res.data.id))
  expect(row?.passwordHash).toBeNull()
})

test('an account cannot be created without a password', async () => {
  const db = await seeded()
  const res = await createUserAs(db, actor('admin'), {
    name: 'Parolasız', email: 'parolasiz@nove.group', role: 'executive', departmentId: null,
  })
  expect(res.ok).toBe(false)
})

test('a short password is rejected', async () => {
  const db = await seeded()
  const res = await createUserAs(db, actor('admin'), {
    name: 'Kısa Parola', email: 'kisa@nove.group', role: 'admin',
    departmentId: null, password: 'kisa123',
  })
  expect(res.ok).toBe(false)
})

test('a duplicate email is refused rather than throwing', async () => {
  const db = await seeded()
  const res = await createUserAs(db, actor('admin'), {
    name: 'Kopya', email: 'elif.cinar@nove.group', role: 'admin',
    departmentId: null, password: NEW_PASSWORD,
  })
  expect(res.ok).toBe(false)
  if (!res.ok) expect(res.error).toContain('zaten kayıtlı')
})

test('a non-admin cannot create users', async () => {
  const db = await seeded()
  for (const role of ['executive', 'staff'] as const) {
    const res = await createUserAs(db, actor(role, 'u-genel.mudurluk'), {
      name: 'X', email: `x-${role}@nove.group`, role: 'admin',
      departmentId: null, password: NEW_PASSWORD,
    })
    expect(res.ok, role).toBe(false)
  }
})

/* --------------------------------- roles -------------------------------- */

test('demoting a user to staff revokes their password', async () => {
  const db = await seeded()
  const res = await setUserRoleAs(db, actor('admin'), {
    userId: OTHER_ADMIN_ID, role: 'staff',
  })
  expect(res.ok).toBe(true)

  const [row] = await db.select().from(users).where(eq(users.id, OTHER_ADMIN_ID))
  expect(row?.role).toBe('staff')
  expect(row?.passwordHash).toBeNull()
})

test('you cannot remove your own admin rights', async () => {
  const db = await seeded()
  const res = await setUserRoleAs(db, actor('admin'), { userId: ADMIN_ID, role: 'executive' })
  expect(res.ok).toBe(false)
})

test('the last admin cannot be demoted', async () => {
  const db = await seeded()
  // Demote the second admin first, leaving exactly one.
  await setUserRoleAs(db, actor('admin'), { userId: OTHER_ADMIN_ID, role: 'staff' })
  // Now try to demote the remaining one, acting as the other admin.
  const res = await setUserRoleAs(db, actor('admin', OTHER_ADMIN_ID), {
    userId: ADMIN_ID, role: 'staff',
  })
  expect(res.ok).toBe(false)
  if (!res.ok) expect(res.error).toContain('Son yönetici')
})

/* --------------------------------- state -------------------------------- */

test('a user can be deactivated and reactivated', async () => {
  const db = await seeded()
  expect((await setUserStateAs(db, actor('admin'), {
    userId: 'u-murat.sen', state: 'passive',
  })).ok).toBe(true)

  const [off] = await db.select().from(users).where(eq(users.id, 'u-murat.sen'))
  expect(off?.state).toBe('passive')

  expect((await setUserStateAs(db, actor('admin'), {
    userId: 'u-murat.sen', state: 'active',
  })).ok).toBe(true)
})

test('you cannot deactivate yourself', async () => {
  const db = await seeded()
  const res = await setUserStateAs(db, actor('admin'), { userId: ADMIN_ID, state: 'passive' })
  expect(res.ok).toBe(false)
})

/* -------------------------------- delete -------------------------------- */

test('a person referenced by key results cannot be deleted', async () => {
  const db = await seeded()
  // Murat Şen owns key results in the seed.
  const res = await deleteUserAs(db, actor('admin'), { userId: 'u-murat.sen' })
  expect(res.ok).toBe(false)
  if (!res.ok) expect(res.error).toContain('pasifleştir')

  expect(await db.select().from(users).where(eq(users.id, 'u-murat.sen'))).toHaveLength(1)
})

test('an unreferenced person is deleted', async () => {
  const db = await seeded()
  const created = await createUserAs(db, actor('admin'), {
    name: 'Geçici Kişi', email: 'gecici@nove.group', role: 'staff', departmentId: null,
  })
  expect(created.ok).toBe(true)
  if (!created.ok) return

  const res = await deleteUserAs(db, actor('admin'), { userId: created.data.id })
  expect(res.ok).toBe(true)
  expect(await db.select().from(users).where(eq(users.id, created.data.id))).toHaveLength(0)
})

test('you cannot delete yourself', async () => {
  const db = await seeded()
  const res = await deleteUserAs(db, actor('admin'), { userId: ADMIN_ID })
  expect(res.ok).toBe(false)
})

/* ------------------------------- passwords ------------------------------ */

test('an admin resets another account password', async () => {
  const db = await seeded()
  const res = await setUserPasswordAs(db, actor('admin'), {
    userId: OTHER_ADMIN_ID, password: NEW_PASSWORD,
  })
  expect(res.ok).toBe(true)

  const [row] = await db.select().from(users).where(eq(users.id, OTHER_ADMIN_ID))
  expect(await bcrypt.compare(NEW_PASSWORD, row?.passwordHash ?? '')).toBe(true)
})

test('a staff record cannot be given a password', async () => {
  const db = await seeded()
  const res = await setUserPasswordAs(db, actor('admin'), {
    userId: 'u-murat.sen', password: NEW_PASSWORD,
  })
  expect(res.ok).toBe(false)
})

test('changing your own password requires the current one', async () => {
  const { db, password } = await seededWithPassword()

  const wrong = await changeOwnPasswordAs(db, actor('admin'), {
    currentPassword: 'yanlis-parola', newPassword: NEW_PASSWORD,
  })
  expect(wrong.ok).toBe(false)

  const right = await changeOwnPasswordAs(db, actor('admin'), {
    currentPassword: password, newPassword: NEW_PASSWORD,
  })
  expect(right.ok).toBe(true)

  const [row] = await db.select().from(users).where(eq(users.id, ADMIN_ID))
  expect(await bcrypt.compare(NEW_PASSWORD, row?.passwordHash ?? '')).toBe(true)
})

test('the new password must differ from the current one', async () => {
  const { db, password } = await seededWithPassword()
  const res = await changeOwnPasswordAs(db, actor('admin'), {
    currentPassword: password, newPassword: password,
  })
  expect(res.ok).toBe(false)
})

test('an executive can still change their own password', async () => {
  const { db, password } = await seededWithPassword()
  const res = await changeOwnPasswordAs(db, actor('executive', 'u-genel.mudurluk'), {
    currentPassword: password, newPassword: NEW_PASSWORD,
  })
  expect(res.ok).toBe(true)
})
