import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { expect, test } from 'vitest'
import type { SessionUser } from '@/lib/auth/permissions'
import { createTestDb } from '@/lib/db'
import { keyResults, users } from '@/lib/db/schema'
import { seed } from '@/lib/db/seed'
import type { Role } from '@/lib/domain/types'
import {
  changeOwnPasswordAs,
  createUserAs,
  deleteUserAs,
  setUserPasswordAs,
  setUserRoleAs,
  setUserStateAs,
  updateUserFieldsAs,
} from '../core/users'
import { FORBIDDEN } from '../types'

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

// The three real accounts — all admins, no home department.
const ADMIN_ID = 'u-kagan.ozturk'
const OTHER_ADMIN_ID = 'u-oguzhan.kizilcan'
const THIRD_ADMIN_ID = 'u-bahadir.temizer'

const actor = (role: Role, id = ADMIN_ID): SessionUser => ({
  id, name: 'Test', email: 't@nove.group', role, departmentId: null,
})

const NEW_PASSWORD = 'YeniParola2026!'

/* -------------------------------- create -------------------------------- */

test('an admin creates an account with a hashed password', async () => {
  const db = await seeded()
  const res = await createUserAs(db, actor('admin'), {
    name: 'Yeni Yönetici', email: 'yeni@nove.group', role: 'admin',
    departmentId: null, password: NEW_PASSWORD,
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
    name: 'Yeni Personel', email: 'personel@nove.group', role: 'staff', departmentId: 'satis',
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
    name: 'Kopya', email: 'kagan.ozturk@nove.group', role: 'admin',
    departmentId: null, password: NEW_PASSWORD,
  })
  expect(res.ok).toBe(false)
  if (!res.ok) {
    expect(res.error.tr).toContain('zaten kayıtlı')
    expect(res.error.en).toContain('already registered')
  }
})

test('a non-admin cannot create users', async () => {
  const db = await seeded()
  for (const role of ['executive', 'staff'] as const) {
    const res = await createUserAs(db, actor(role, 'x-someone-else'), {
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
  // The seed carries three admins, not a fixed two, so this establishes the
  // "exactly one admin left" precondition explicitly rather than assuming a
  // count that could silently change with the seed. Demote every admin but
  // one, acting as the survivor throughout.
  const admins = await db.select().from(users).where(eq(users.role, 'admin'))
  expect(admins.length).toBeGreaterThan(1)
  const [survivor, actingAdmin, ...rest] = admins
  if (!survivor || !actingAdmin) throw new Error('need at least two admins to set up this test')

  for (const a of [actingAdmin, ...rest]) {
    const demote = await setUserRoleAs(db, actor('admin', survivor.id), { userId: a.id, role: 'staff' })
    expect(demote.ok, a.id).toBe(true)
  }

  // Exactly one admin now remains. Demoting them must be refused — acting as
  // someone other than the survivor, so this exercises the "last admin" guard
  // rather than the separate "cannot demote yourself" guard.
  const res = await setUserRoleAs(db, actor('admin', actingAdmin.id), {
    userId: survivor.id, role: 'staff',
  })
  expect(res.ok).toBe(false)
  if (!res.ok) {
    expect(res.error.tr).toContain('Son yönetici')
    expect(res.error.en).toContain('last admin')
  }
})

/* --------------------------------- state -------------------------------- */

test('a user can be deactivated and reactivated', async () => {
  const db = await seeded()
  // The real seed has only the three admins — deactivating one of them risks
  // tripping the "last active admin" guard, so this plants a fresh staff
  // record to exercise plain state toggling instead.
  const created = await createUserAs(db, actor('admin'), {
    name: 'Geçici Personel', email: 'gecici-personel@nove.group', role: 'staff', departmentId: null,
  })
  expect(created.ok).toBe(true)
  if (!created.ok) return

  expect((await setUserStateAs(db, actor('admin'), {
    userId: created.data.id, state: 'passive',
  })).ok).toBe(true)

  const [off] = await db.select().from(users).where(eq(users.id, created.data.id))
  expect(off?.state).toBe('passive')

  expect((await setUserStateAs(db, actor('admin'), {
    userId: created.data.id, state: 'active',
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
  // The real seed leaves every owner blank — nobody is referenced by
  // anything yet — so the reference this guard checks for has to be created
  // here, or the check would never fire and the test would prove nothing.
  await db.update(keyResults).set({ ownerUserId: THIRD_ADMIN_ID }).where(eq(keyResults.id, 'k-msf-yorum'))

  const res = await deleteUserAs(db, actor('admin'), { userId: THIRD_ADMIN_ID })
  expect(res.ok).toBe(false)
  if (!res.ok) {
    expect(res.error.tr).toContain('pasifleştir')
    expect(res.error.en).toContain('Deactivate')
  }

  expect(await db.select().from(users).where(eq(users.id, THIRD_ADMIN_ID))).toHaveLength(1)
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
  // The real seed has no staff records at all (all three accounts are
  // admins), so one is planted here to exercise the guard.
  const created = await createUserAs(db, actor('admin'), {
    name: 'Personel', email: 'personel-parola@nove.group', role: 'staff', departmentId: null,
  })
  expect(created.ok).toBe(true)
  if (!created.ok) return

  const res = await setUserPasswordAs(db, actor('admin'), {
    userId: created.data.id, password: NEW_PASSWORD,
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

test('an executive can still change their own password — self-service does not check role', async () => {
  // `changeOwnPasswordAs` never calls `can()`; it only looks up the acting
  // user's own row and checks the current password. There is no executive
  // account in the real seed to prove this with, so the claim is demonstrated
  // the same way regardless: a session that *claims* role 'executive' still
  // succeeds, against a real account's password, because the function does
  // not consult the role at all.
  const { db, password } = await seededWithPassword()
  const res = await changeOwnPasswordAs(db, actor('executive', THIRD_ADMIN_ID), {
    currentPassword: password, newPassword: NEW_PASSWORD,
  })
  expect(res.ok).toBe(true)
})

/* --------------------------- people & hierarchy --------------------------- */

async function person(
  db: Awaited<ReturnType<typeof seeded>>,
  name: string,
  managerId?: string,
): Promise<string> {
  const res = await createUserAs(db, actor('admin'), { name, role: 'staff', departmentId: null })
  if (!res.ok) throw new Error(res.error.tr)
  if (managerId) {
    const m = await updateUserFieldsAs(db, actor('admin'), { userId: res.data.id, managerId })
    if (!m.ok) throw new Error(m.error.tr)
  }
  return res.data.id
}

test('a staff record can be created without an email', async () => {
  const db = await seeded()
  const id = await person(db, 'E-postasız Kişi')
  const [row] = await db.select().from(users).where(eq(users.id, id))
  expect(row).toMatchObject({ email: null, passwordHash: null, managerId: null })
})

test('an account that can sign in still needs an email', async () => {
  const db = await seeded()
  const res = await createUserAs(db, actor('admin'), {
    name: 'Adressiz Yönetici', role: 'admin', departmentId: null, password: 'uzun-bir-parola-123',
  })
  expect(res.ok).toBe(false)
})

test('department, manager and title are set one field at a time; absent fields are left alone', async () => {
  const db = await seeded()
  const boss = await person(db, 'Bölüm Müdürü')
  const worker = await person(db, 'Ekip Üyesi')

  expect((await updateUserFieldsAs(db, actor('admin'), { userId: worker, departmentId: 'satis' })).ok).toBe(true)
  expect((await updateUserFieldsAs(db, actor('admin'), { userId: worker, managerId: boss })).ok).toBe(true)
  expect((await updateUserFieldsAs(db, actor('admin'), { userId: worker, title: '  Uzman  ' })).ok).toBe(true)

  const [row] = await db.select().from(users).where(eq(users.id, worker))
  expect(row).toMatchObject({ departmentId: 'satis', managerId: boss, title: 'Uzman' })

  // Clearing works too.
  await updateUserFieldsAs(db, actor('admin'), { userId: worker, managerId: null, title: '' })
  const [cleared] = await db.select().from(users).where(eq(users.id, worker))
  expect(cleared).toMatchObject({ departmentId: 'satis', managerId: null, title: null })
})

test('a manager assignment that would close a loop is refused, in both languages', async () => {
  const db = await seeded()
  const top = await person(db, 'Tepe Kişi')
  const mid = await person(db, 'Orta Kişi', top)
  const res = await updateUserFieldsAs(db, actor('admin'), { userId: top, managerId: mid })
  expect(res.ok).toBe(false)
  if (!res.ok) {
    expect(res.error.tr).toContain('döngü')
    expect(res.error.en).toContain('loop')
  }
  expect((await updateUserFieldsAs(db, actor('admin'), { userId: top, managerId: top })).ok).toBe(false)
})

test('a passive person or an unknown id cannot be made a manager', async () => {
  const db = await seeded()
  const old = await person(db, 'Ayrılan Kişi')
  await setUserStateAs(db, actor('admin'), { userId: old, state: 'passive' })
  const worker = await person(db, 'Yeni Kişi')
  expect((await updateUserFieldsAs(db, actor('admin'), { userId: worker, managerId: old })).ok).toBe(false)
  expect((await updateUserFieldsAs(db, actor('admin'), { userId: worker, managerId: 'u-yok' })).ok).toBe(false)
  expect((await updateUserFieldsAs(db, actor('admin'), { userId: worker, departmentId: 'yok' })).ok).toBe(false)
})

test('a person with active reports cannot be deactivated or deleted', async () => {
  const db = await seeded()
  const boss = await person(db, 'Ekip Lideri')
  await person(db, 'Ekip Üyesi Bir', boss)

  const passive = await setUserStateAs(db, actor('admin'), { userId: boss, state: 'passive' })
  expect(passive.ok).toBe(false)
  if (!passive.ok) expect(passive.error.tr).toContain('1 aktif çalışan')

  expect((await deleteUserAs(db, actor('admin'), { userId: boss })).ok).toBe(false)
})

test('only İK (admin) edits these fields', async () => {
  const db = await seeded()
  const worker = await person(db, 'Herhangi Biri')
  expect(await updateUserFieldsAs(db, actor('executive'), { userId: worker, title: 'x' })).toEqual({
    ok: false,
    error: FORBIDDEN,
  })
})
