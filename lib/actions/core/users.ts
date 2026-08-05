import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { and, count, eq, ne } from 'drizzle-orm'
import { z } from 'zod'
import { can, type SessionUser } from '@/lib/auth/permissions'
import type { Db } from '@/lib/db'
import { checkins, keyResults, objectives, users } from '@/lib/db/schema'
import { canSignIn, type Role } from '@/lib/domain/types'
import { fail, FORBIDDEN, ok, type ActionResult } from '../types'

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
  .min(2, 'İsim en az 2 karakter olmalı.')
  .max(120, 'İsim çok uzun.')

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Geçerli bir e-posta gir.')
  .max(160)

/**
 * Twelve characters rather than the usual eight: these accounts hold the whole
 * company's performance data and there is no second factor.
 */
const passwordSchema = z
  .string()
  .min(12, 'Parola en az 12 karakter olmalı.')
  .max(200, 'Parola çok uzun.')

const BCRYPT_ROUNDS = 10

export const createUserSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    role: roleSchema,
    departmentId: z.string().min(1).nullable().default(null),
    /** Required for accounts, forbidden for staff. */
    password: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (canSignIn(v.role)) {
      const parsed = passwordSchema.safeParse(v.password ?? '')
      if (!parsed.success) {
        ctx.addIssue({
          code: 'custom',
          path: ['password'],
          message: parsed.error.issues[0]?.message ?? 'Parola gerekli.',
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
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Girdi geçersiz.')
  const data = parsed.data

  const [existing] = await db.select().from(users).where(eq(users.email, data.email)).limit(1)
  if (existing) return fail('Bu e-posta zaten kayıtlı.')

  const id = `u-${randomUUID()}`
  await db.insert(users).values({
    id,
    name: data.name,
    email: data.email,
    role: data.role,
    departmentId: data.departmentId,
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
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Girdi geçersiz.')
  const { userId, role } = parsed.data

  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!target) return fail('Kullanıcı bulunamadı.')

  // Demoting the last admin would lock everyone out of user management.
  if (target.role === 'admin' && role !== 'admin' && (await otherActiveAdmins(db, userId)) === 0) {
    return fail('Son yönetici hesabının rolü değiştirilemez.')
  }
  if (target.id === actor.id && role !== 'admin') {
    return fail('Kendi yönetici yetkini kaldıramazsın.')
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
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Girdi geçersiz.')
  const { userId, state } = parsed.data

  if (userId === actor.id && state === 'passive') {
    return fail('Kendi hesabını pasifleştiremezsin.')
  }

  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!target) return fail('Kullanıcı bulunamadı.')

  if (
    target.role === 'admin' &&
    state === 'passive' &&
    (await otherActiveAdmins(db, userId)) === 0
  ) {
    return fail('Son aktif yönetici pasifleştirilemez.')
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
  if (input.userId === actor.id) return fail('Kendi hesabını silemezsin.')

  const [target] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1)
  if (!target) return fail('Kullanıcı bulunamadı.')

  if (target.role === 'admin' && (await otherActiveAdmins(db, input.userId)) === 0) {
    return fail('Son yönetici hesabı silinemez.')
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
      `Bu kişi ${referenced} kayıtta sorumlu görünüyor. Silmek yerine pasifleştir.`,
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
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Girdi geçersiz.')

  const [target] = await db.select().from(users).where(eq(users.id, parsed.data.userId)).limit(1)
  if (!target) return fail('Kullanıcı bulunamadı.')
  if (!canSignIn(target.role)) {
    return fail('Personel kayıtlarının parolası olmaz. Önce rolünü değiştir.')
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
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Girdi geçersiz.')

  const [me] = await db.select().from(users).where(eq(users.id, actor.id)).limit(1)
  if (!me?.passwordHash) return fail('Hesap bulunamadı.')

  const okCurrent = await bcrypt.compare(parsed.data.currentPassword, me.passwordHash)
  if (!okCurrent) return fail('Mevcut parola hatalı.')

  if (parsed.data.currentPassword === parsed.data.newPassword) {
    return fail('Yeni parola mevcut parolayla aynı olamaz.')
  }

  await db
    .update(users)
    .set({ passwordHash: await bcrypt.hash(parsed.data.newPassword, BCRYPT_ROUNDS) })
    .where(eq(users.id, actor.id))

  return ok({ id: actor.id })
}
