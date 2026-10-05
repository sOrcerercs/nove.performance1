import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { and, count, eq, ne } from 'drizzle-orm'
import { z } from 'zod'
import { can, type SessionUser } from '@/lib/auth/permissions'
import type { Db } from '@/lib/db'
import { wouldCreateCycle } from '@/lib/auth/hierarchy'
import { checkins, departments, keyResults, objectives, users } from '@/lib/db/schema'
import { canSignIn, type Role } from '@/lib/domain/types'
import { fail, FORBIDDEN, fromIssue, msg, ok, type ActionResult } from '../types'

/** Validation messages; the schemas carry `.tr`, `fromIssue` maps it back. */
const M = {
  nameShort: msg('İsim en az 2 karakter olmalı.', 'Name must be at least 2 characters.'),
  nameLong: msg('İsim çok uzun.', 'Name is too long.'),
  emailInvalid: msg('Geçerli bir e-posta gir.', 'Enter a valid email.'),
  passwordShort: msg('Parola en az 12 karakter olmalı.', 'Password must be at least 12 characters.'),
  passwordLong: msg('Parola çok uzun.', 'Password is too long.'),
  passwordRequired: msg('Parola gerekli.', 'Password is required.'),
  emailRequired: msg('Giriş yapabilen hesaplar için e-posta gerekli.', 'Accounts that can sign in need an email.'),
  titleLong: msg('Unvan çok uzun.', 'Title is too long.'),
}

/* ------------------------------------------------------------------ *
 * These cores take the acting user as an argument, so they must NOT live in a
 * `'use server'` module: Next publishes an RPC endpoint for every export of
 * one, and a client could then claim to be an admin. The thin wrappers in
 * lib/actions/users.ts get the actor from the session instead.
 * ------------------------------------------------------------------ */

const roleSchema = z.enum(['admin', 'executive', 'staff'])

const nameSchema = z
  .string()
  .trim()
  .min(2, M.nameShort.tr)
  .max(120, M.nameLong.tr)

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email(M.emailInvalid.tr)
  .max(160)

/**
 * Twelve characters rather than the usual eight: these accounts hold the whole
 * company's performance data and there is no second factor.
 */
const passwordSchema = z
  .string()
  .min(12, M.passwordShort.tr)
  .max(200, M.passwordLong.tr)

const BCRYPT_ROUNDS = 10

export const createUserSchema = z
  .object({
    name: nameSchema,
    /** Optional: the HR list has none. Staff without one simply cannot sign in. */
    email: emailSchema.nullable().optional().transform((v) => v ?? null),
    role: roleSchema,
    departmentId: z.string().min(1).nullable().default(null),
    title: z.string().trim().max(120, M.titleLong.tr).nullable().optional().transform((v) => (v ? v : null)),
    /** Required for accounts, forbidden for staff. */
    password: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (canSignIn(v.role)) {
      if (!v.email) {
        ctx.addIssue({ code: 'custom', path: ['email'], message: M.emailRequired.tr })
        return
      }
      const parsed = passwordSchema.safeParse(v.password ?? '')
      if (!parsed.success) {
        ctx.addIssue({
          code: 'custom',
          path: ['password'],
          message: parsed.error.issues[0]?.message ?? M.passwordRequired.tr,
        })
      }
    }
  })

export type CreateUserInput = z.input<typeof createUserSchema>

/** How many active admins remain once `excludingUserId` is discounted. */
async function otherActiveAdmins(db: Db, excludingUserId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.role, 'admin'), eq(users.state, 'active'), ne(users.id, excludingUserId)))
  return Number(row?.n ?? 0)
}

export async function createUserAs(
  db: Db,
  actor: SessionUser,
  input: CreateUserInput,
): Promise<ActionResult<{ id: string }>> {
  if (!can(actor, 'manage:users')) return fail(FORBIDDEN)

  const parsed = createUserSchema.safeParse(input)
  if (!parsed.success) return fail(fromIssue(parsed.error.issues[0]?.message, M))
  const data = parsed.data

  if (data.email) {
    const [existing] = await db.select().from(users).where(eq(users.email, data.email)).limit(1)
    if (existing) return fail(msg('Bu e-posta zaten kayıtlı.', 'This email is already registered.'))
  }

  const id = `u-${randomUUID()}`
  await db.insert(users).values({
    id,
    name: data.name,
    email: data.email,
    role: data.role,
    departmentId: data.departmentId,
    title: data.title,
    // Staff are personnel records: no credential, and no login state to be in.
    passwordHash: canSignIn(data.role)
      ? await bcrypt.hash(data.password as string, BCRYPT_ROUNDS)
      : null,
    state: 'active',
  })

  return ok({ id })
}

export async function setUserRoleAs(
  db: Db,
  actor: SessionUser,
  input: { userId: string; role: Role },
): Promise<ActionResult<{ id: string; role: Role }>> {
  if (!can(actor, 'manage:users')) return fail(FORBIDDEN)

  const parsed = z.object({ userId: z.string().min(1), role: roleSchema }).safeParse(input)
  if (!parsed.success) return fail(fromIssue(parsed.error.issues[0]?.message, M))
  const { userId, role } = parsed.data

  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!target) return fail(msg('Kullanıcı bulunamadı.', 'User not found.'))

  // Demoting the last admin would lock everyone out of user management.
  if (target.role === 'admin' && role !== 'admin' && (await otherActiveAdmins(db, userId)) === 0) {
    return fail(msg('Son yönetici hesabının rolü değiştirilemez.', "The last admin account's role can't be changed."))
  }
  if (target.id === actor.id && role !== 'admin') {
    return fail(msg('Kendi yönetici yetkini kaldıramazsın.', "You can't remove your own admin role."))
  }

  await db
    .update(users)
    .set({
      role,
      // Demoting to staff revokes the credential rather than leaving a dormant
      // one behind; promoting leaves the account password-less until one is set.
      ...(canSignIn(role) ? {} : { passwordHash: null }),
    })
    .where(eq(users.id, userId))

  return ok({ id: userId, role })
}

export async function setUserStateAs(
  db: Db,
  actor: SessionUser,
  input: { userId: string; state: 'active' | 'passive' },
): Promise<ActionResult<{ id: string }>> {
  if (!can(actor, 'manage:users')) return fail(FORBIDDEN)

  const parsed = z
    .object({ userId: z.string().min(1), state: z.enum(['active', 'passive']) })
    .safeParse(input)
  if (!parsed.success) return fail(fromIssue(parsed.error.issues[0]?.message, M))
  const { userId, state } = parsed.data

  if (userId === actor.id && state === 'passive') {
    return fail(msg('Kendi hesabını pasifleştiremezsin.', "You can't deactivate your own account."))
  }

  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!target) return fail(msg('Kullanıcı bulunamadı.', 'User not found.'))

  if (
    target.role === 'admin' &&
    state === 'passive' &&
    (await otherActiveAdmins(db, userId)) === 0
  ) {
    return fail(msg('Son aktif yönetici pasifleştirilemez.', "The last active admin can't be deactivated."))
  }

  if (state === 'passive') {
    const [reports] = await db
      .select({ n: count() })
      .from(users)
      .where(and(eq(users.managerId, userId), eq(users.state, 'active')))
    const n = Number(reports?.n ?? 0)
    if (n > 0) {
      return fail(
        msg(
          `Bu kişiye bağlı ${n} aktif çalışan var, önce yeni yöneticilerini seçin.`,
          `${n} active ${n === 1 ? 'person reports' : 'people report'} to this person. Choose their new manager first.`,
        ),
      )
    }
  }

  await db.update(users).set({ state }).where(eq(users.id, userId))
  return ok({ id: userId })
}

/**
 * Hard-deletes a user, but only when nothing references them.
 *
 * Objectives, key results, and check-ins all point at users. Cascading those
 * away would silently destroy performance history, so a referenced person must
 * be deactivated instead — the caller is told which it is.
 */
export async function deleteUserAs(
  db: Db,
  actor: SessionUser,
  input: { userId: string },
): Promise<ActionResult<{ id: string }>> {
  if (!can(actor, 'manage:users')) return fail(FORBIDDEN)
  if (input.userId === actor.id) return fail(msg('Kendi hesabını silemezsin.', "You can't delete your own account."))

  const [target] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1)
  if (!target) return fail(msg('Kullanıcı bulunamadı.', 'User not found.'))

  if (target.role === 'admin' && (await otherActiveAdmins(db, input.userId)) === 0) {
    return fail(msg('Son yönetici hesabı silinemez.', "The last admin account can't be deleted."))
  }

  const [reports] = await db.select({ n: count() }).from(users).where(eq(users.managerId, input.userId))
  if (Number(reports?.n ?? 0) > 0) {
    return fail(
      msg(
        'Bu kişiye bağlı çalışanlar var. Önce yeni yöneticilerini seçin.',
        'People report to this person. Choose their new manager first.',
      ),
    )
  }

  const [krs, objs, chks] = await Promise.all([
    db.select({ n: count() }).from(keyResults).where(eq(keyResults.ownerUserId, input.userId)),
    db.select({ n: count() }).from(objectives).where(eq(objectives.ownerUserId, input.userId)),
    db.select({ n: count() }).from(checkins).where(eq(checkins.authorUserId, input.userId)),
  ])
  const referenced =
    Number(krs[0]?.n ?? 0) + Number(objs[0]?.n ?? 0) + Number(chks[0]?.n ?? 0)

  if (referenced > 0) {
    return fail(
      msg(
        `Bu kişi ${referenced} kayıtta sorumlu görünüyor. Silmek yerine pasifleştir.`,
        `This person is listed as owner on ${referenced} ${referenced === 1 ? 'record' : 'records'}. Deactivate them instead of deleting.`,
      ),
    )
  }

  await db.delete(users).where(eq(users.id, input.userId))
  return ok({ id: input.userId })
}

/** An admin sets someone else's password — the reset path, since there is no email. */
export async function setUserPasswordAs(
  db: Db,
  actor: SessionUser,
  input: { userId: string; password: string },
): Promise<ActionResult<{ id: string }>> {
  if (!can(actor, 'manage:users')) return fail(FORBIDDEN)

  const parsed = z
    .object({ userId: z.string().min(1), password: passwordSchema })
    .safeParse(input)
  if (!parsed.success) return fail(fromIssue(parsed.error.issues[0]?.message, M))

  const [target] = await db.select().from(users).where(eq(users.id, parsed.data.userId)).limit(1)
  if (!target) return fail(msg('Kullanıcı bulunamadı.', 'User not found.'))
  if (!canSignIn(target.role)) {
    return fail(msg('Personel kayıtlarının parolası olmaz. Önce rolünü değiştir.', "Staff records don't have a password. Change the role first."))
  }

  await db
    .update(users)
    .set({
      passwordHash: await bcrypt.hash(parsed.data.password, BCRYPT_ROUNDS),
      state: 'active',
    })
    .where(eq(users.id, parsed.data.userId))

  return ok({ id: parsed.data.userId })
}

export interface UpdateUserFieldsInput {
  userId: string
  departmentId?: string | null
  managerId?: string | null
  title?: string | null
}

const updateUserFieldsSchema = z.object({
  userId: z.string().min(1),
  departmentId: z.string().min(1).nullable().optional(),
  managerId: z.string().min(1).nullable().optional(),
  title: z.string().trim().max(120, M.titleLong.tr).nullable().optional(),
})

/**
 * The Kullanıcılar table's inline edits — one field at a time in practice, but
 * any subset is accepted. Absent fields are left alone; null clears.
 */
export async function updateUserFieldsAs(
  db: Db,
  actor: SessionUser,
  input: UpdateUserFieldsInput,
): Promise<ActionResult<{ id: string }>> {
  if (!can(actor, 'manage:users')) return fail(FORBIDDEN)

  const parsed = updateUserFieldsSchema.safeParse(input)
  if (!parsed.success) return fail(fromIssue(parsed.error.issues[0]?.message, M))
  const data = parsed.data

  const [target] = await db.select().from(users).where(eq(users.id, data.userId)).limit(1)
  if (!target) return fail(msg('Kullanıcı bulunamadı.', 'User not found.'))

  const patch: Partial<typeof users.$inferInsert> = {}

  if (data.departmentId !== undefined) {
    if (data.departmentId !== null) {
      const [dept] = await db
        .select({ id: departments.id })
        .from(departments)
        .where(eq(departments.id, data.departmentId))
        .limit(1)
      if (!dept) return fail(msg('Bölüm bulunamadı.', 'Department not found.'))
    }
    patch.departmentId = data.departmentId
  }

  if (data.managerId !== undefined) {
    if (data.managerId !== null) {
      const all = await db
        .select({ id: users.id, managerId: users.managerId, state: users.state })
        .from(users)
      const manager = all.find((u) => u.id === data.managerId)
      if (!manager || manager.state !== 'active') {
        return fail(msg('Yönetici bulunamadı ya da pasif.', 'Manager not found or inactive.'))
      }
      if (wouldCreateCycle(target.id, data.managerId, all)) {
        return fail(
          msg(
            'Bu atama döngü oluşturur: kişi kendine ya da kendi ekibindeki birine bağlanamaz.',
            'This would create a loop: a person cannot report to themselves or to someone in their own team.',
          ),
        )
      }
    }
    patch.managerId = data.managerId
  }

  if (data.title !== undefined) patch.title = data.title ? data.title : null

  if (Object.keys(patch).length > 0) {
    await db.update(users).set(patch).where(eq(users.id, target.id))
  }
  return ok({ id: target.id })
}

/**
 * A signed-in user changes their own password.
 *
 * Requires the current password even though there is already a valid session:
 * it is what stops an unattended browser from becoming a permanent takeover.
 */
export async function changeOwnPasswordAs(
  db: Db,
  actor: SessionUser,
  input: { currentPassword: string; newPassword: string },
): Promise<ActionResult<{ id: string }>> {
  const parsed = z
    .object({ currentPassword: z.string().min(1), newPassword: passwordSchema })
    .safeParse(input)
  if (!parsed.success) return fail(fromIssue(parsed.error.issues[0]?.message, M))

  const [me] = await db.select().from(users).where(eq(users.id, actor.id)).limit(1)
  if (!me?.passwordHash) return fail(msg('Hesap bulunamadı.', 'Account not found.'))

  const okCurrent = await bcrypt.compare(parsed.data.currentPassword, me.passwordHash)
  if (!okCurrent) return fail(msg('Mevcut parola hatalı.', 'The current password is incorrect.'))

  if (parsed.data.currentPassword === parsed.data.newPassword) {
    return fail(msg('Yeni parola mevcut parolayla aynı olamaz.', "The new password can't be the same as the current one."))
  }

  await db
    .update(users)
    .set({ passwordHash: await bcrypt.hash(parsed.data.newPassword, BCRYPT_ROUNDS) })
    .where(eq(users.id, actor.id))

  return ok({ id: actor.id })
}
