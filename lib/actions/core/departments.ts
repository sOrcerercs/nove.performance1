import { randomUUID } from 'node:crypto'
import { count, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { can, type SessionUser } from '@/lib/auth/permissions'
import type { Db } from '@/lib/db'
import { checkins, departments, keyResults, objectives, users } from '@/lib/db/schema'
import { fail, FORBIDDEN, ok, type ActionResult } from '../types'

/* ------------------------------------------------------------------ *
 * Department management.
 *
 * As with the other cores, the acting user is a parameter, so this module must
 * not carry `'use server'` — see lib/actions/departments.ts for the wrappers.
 * ------------------------------------------------------------------ */

/** Lowercase letters, digits and dashes: it appears in `/bolum/<slug>`. */
const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, 'Kısa ad en az 2 karakter olmalı.')
  .max(40)
  .regex(/^[a-z0-9-]+$/, 'Kısa ad yalnızca küçük harf, rakam ve tire içerebilir.')

const nameSchema = z.string().trim().min(2, 'Bölüm adı en az 2 karakter olmalı.').max(80)

export const createDepartmentSchema = z.object({
  slug: slugSchema,
  emoji: z.string().trim().min(1, 'Emoji gerekli.').max(8),
  nameTr: nameSchema,
  nameEn: nameSchema,
  leadUserId: z.string().min(1).nullable().default(null),
})

export const updateDepartmentSchema = z.object({
  id: z.string().min(1),
  emoji: z.string().trim().min(1, 'Emoji gerekli.').max(8),
  nameTr: nameSchema,
  nameEn: nameSchema,
  leadUserId: z.string().min(1).nullable().default(null),
})

export type CreateDepartmentInput = z.input<typeof createDepartmentSchema>
export type UpdateDepartmentInput = z.input<typeof updateDepartmentSchema>

export async function createDepartmentAs(
  db: Db,
  actor: SessionUser,
  input: CreateDepartmentInput,
): Promise<ActionResult<{ id: string; slug: string }>> {
  if (!can(actor, 'manage:departments')) return fail(FORBIDDEN)

  const parsed = createDepartmentSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Girdi geçersiz.')
  const data = parsed.data

  const [clash] = await db
    .select()
    .from(departments)
    .where(eq(departments.slug, data.slug))
    .limit(1)
  if (clash) return fail('Bu kısa ad zaten kullanılıyor.')

  // Appended to the end of the sidebar rather than inserted mid-list.
  const [last] = await db
    .select({ sortOrder: departments.sortOrder })
    .from(departments)
    .orderBy(desc(departments.sortOrder))
    .limit(1)

  const id = `d-${randomUUID()}`
  await db.insert(departments).values({
    id,
    slug: data.slug,
    emoji: data.emoji,
    nameTr: data.nameTr,
    nameEn: data.nameEn,
    leadUserId: data.leadUserId,
    sortOrder: (last?.sortOrder ?? -1) + 1,
  })

  return ok({ id, slug: data.slug })
}

/**
 * Renames a department and reassigns its lead.
 *
 * The slug is deliberately not editable: it is the department's URL, and
 * changing it would silently break every link and bookmark pointing at it.
 */
export async function updateDepartmentAs(
  db: Db,
  actor: SessionUser,
  input: UpdateDepartmentInput,
): Promise<ActionResult<{ id: string }>> {
  if (!can(actor, 'manage:departments')) return fail(FORBIDDEN)

  const parsed = updateDepartmentSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Girdi geçersiz.')
  const data = parsed.data

  const [dept] = await db.select().from(departments).where(eq(departments.id, data.id)).limit(1)
  if (!dept) return fail('Bölüm bulunamadı.')

  await db
    .update(departments)
    .set({
      emoji: data.emoji,
      nameTr: data.nameTr,
      nameEn: data.nameEn,
      leadUserId: data.leadUserId,
    })
    .where(eq(departments.id, data.id))

  return ok({ id: data.id })
}

export interface DepartmentDeletionImpact {
  nameTr: string
  objectives: number
  keyResults: number
  checkins: number
  /** People whose department field points here. */
  users: number
}

/** What stands in the way of deleting a department, and what it would cost. */
export async function describeDepartmentDeletion(
  db: Db,
  actor: SessionUser,
  departmentId: string,
): Promise<ActionResult<DepartmentDeletionImpact>> {
  if (!can(actor, 'manage:departments')) return fail(FORBIDDEN)

  const [dept] = await db
    .select()
    .from(departments)
    .where(eq(departments.id, departmentId))
    .limit(1)
  if (!dept) return fail('Bölüm bulunamadı.')

  const objRows = await db
    .select({ id: objectives.id })
    .from(objectives)
    .where(eq(objectives.departmentId, departmentId))

  let krCount = 0
  let checkinCount = 0
  for (const o of objRows) {
    const krs = await db
      .select({ id: keyResults.id })
      .from(keyResults)
      .where(eq(keyResults.objectiveId, o.id))
    krCount += krs.length
    for (const k of krs) {
      const [c] = await db
        .select({ n: count() })
        .from(checkins)
        .where(eq(checkins.keyResultId, k.id))
      checkinCount += Number(c?.n ?? 0)
    }
  }

  const [u] = await db
    .select({ n: count() })
    .from(users)
    .where(eq(users.departmentId, departmentId))

  return ok({
    nameTr: dept.nameTr,
    objectives: objRows.length,
    keyResults: krCount,
    checkins: checkinCount,
    users: Number(u?.n ?? 0),
  })
}

/**
 * Deletes a department.
 *
 * Refused while it still holds objectives: the schema cascades from department
 * to objective to key result to check-in, so allowing it would erase
 * performance history as a side effect of an org-chart edit. Move or delete the
 * objectives first, deliberately.
 *
 * People are handled differently — their department is just a label, so it is
 * cleared and they survive. (`users.department_id` has no cascade, so Postgres
 * would refuse the delete outright if this were not done first.)
 */
export async function deleteDepartmentAs(
  db: Db,
  actor: SessionUser,
  input: { id: string },
): Promise<ActionResult<{ id: string; detachedUsers: number }>> {
  if (!can(actor, 'manage:departments')) return fail(FORBIDDEN)

  const [dept] = await db.select().from(departments).where(eq(departments.id, input.id)).limit(1)
  if (!dept) return fail('Bölüm bulunamadı.')

  const [objCount] = await db
    .select({ n: count() })
    .from(objectives)
    .where(eq(objectives.departmentId, input.id))

  if (Number(objCount?.n ?? 0) > 0) {
    return fail(
      `Bu bölümde ${objCount?.n} objective var. Silmek performans geçmişini de siler — önce objective'leri kaldır.`,
    )
  }

  const attached = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.departmentId, input.id))

  await db.transaction(async (tx) => {
    if (attached.length > 0) {
      await tx
        .update(users)
        .set({ departmentId: null })
        .where(eq(users.departmentId, input.id))
    }
    // Another department may name someone here as its lead; that is a plain
    // column, not a foreign key, so nothing else needs unpicking.
    await tx.delete(departments).where(eq(departments.id, input.id))
  })

  return ok({ id: input.id, detachedUsers: attached.length })
}

/** Reorders a department within the sidebar by swapping with its neighbour. */
export async function moveDepartmentAs(
  db: Db,
  actor: SessionUser,
  input: { id: string; direction: 'up' | 'down' },
): Promise<ActionResult<{ id: string }>> {
  if (!can(actor, 'manage:departments')) return fail(FORBIDDEN)

  const rows = await db.select().from(departments).orderBy(departments.sortOrder)
  const index = rows.findIndex((d) => d.id === input.id)
  if (index === -1) return fail('Bölüm bulunamadı.')

  const swapWith = input.direction === 'up' ? index - 1 : index + 1
  if (swapWith < 0 || swapWith >= rows.length) return ok({ id: input.id })

  const a = rows[index]
  const b = rows[swapWith]
  if (!a || !b) return fail('Bölüm bulunamadı.')

  await db.transaction(async (tx) => {
    await tx.update(departments).set({ sortOrder: b.sortOrder }).where(eq(departments.id, a.id))
    await tx.update(departments).set({ sortOrder: a.sortOrder }).where(eq(departments.id, b.id))
  })

  return ok({ id: input.id })
}
