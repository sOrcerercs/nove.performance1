import { randomUUID } from 'node:crypto'
import { count, eq } from 'drizzle-orm'
import { can, type SessionUser } from '@/lib/auth/permissions'
import type { Db } from '@/lib/db'
import { checkins, departments, keyResults, objectives, periods } from '@/lib/db/schema'
import { z } from 'zod'
import { createObjectiveSchema, type CreateObjectiveInput } from '@/lib/validation/objective'
import { fail, FORBIDDEN, ok, type ActionResult } from '../types'

/**
 * The whole of "create an objective", with the acting user passed in.
 *
 * Kept free of `requireUser()` and `getDb()` so it can be tested directly
 * against a PGlite database as any role, without mocking a session. The
 * `'use server'` wrapper in ../objectives.ts supplies those two.
 */
export async function createObjectiveFor(
  db: Db,
  user: SessionUser,
  input: CreateObjectiveInput,
): Promise<ActionResult<{ id: string; deptSlug: string }>> {
  const parsed = createObjectiveSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Girdi geçersiz.')
  }
  const data = parsed.data

  if (!can(user, 'create:objective', { departmentId: data.departmentId })) {
    return fail(FORBIDDEN)
  }

  const [dept] = await db
    .select()
    .from(departments)
    .where(eq(departments.id, data.departmentId))
    .limit(1)
  if (!dept) return fail('Bölüm bulunamadı.')

  const [period] = await db
    .select()
    .from(periods)
    .where(eq(periods.code, data.periodCode))
    .limit(1)
  if (!period) return fail('Dönem bulunamadı.')

  // A key result whose start equals its target can never show progress, so it
  // is rejected here rather than silently rendering 0% forever.
  if (data.krs.some((k) => k.start === k.target)) {
    return fail('Key result başlangıç ve hedef değeri aynı olamaz.')
  }

  const existing = await db
    .select({ id: objectives.id })
    .from(objectives)
    .where(eq(objectives.departmentId, dept.id))

  const objectiveId = `o-${randomUUID()}`

  await db.transaction(async (tx) => {
    await tx.insert(objectives).values({
      id: objectiveId,
      code: `O${existing.length + 1}`,
      departmentId: dept.id,
      periodId: period.id,
      titleTr: data.title,
      // No translation pipeline: English mirrors Turkish until someone edits it.
      titleEn: data.title,
      ownerUserId: data.ownerUserId ?? user.id,
    })

    await tx.insert(keyResults).values(
      data.krs.map((k) => ({
        id: `k-${randomUUID()}`,
        objectiveId,
        titleTr: k.title,
        titleEn: k.title,
        start: k.start,
        // Defaults to the start value (0% progress); supplied explicitly when
        // back-filling a closed period with figures that were already achieved.
        current: k.current ?? k.start,
        target: k.target,
        unit: k.unit ?? '',
        confidence: 'mid' as const,
        // Per-key-result owner, falling back to the objective's owner.
        ownerUserId: k.ownerUserId ?? data.ownerUserId ?? user.id,
      })),
    )
  })

  return ok({ id: objectiveId, deptSlug: dept.slug })
}

/* ------------------------------------------------------------------ *
 * Editing an existing objective
 * ------------------------------------------------------------------ */

export const updateObjectiveSchema = z.object({
  id: z.string().min(1),
  title: z
    .string()
    .trim()
    .min(1, 'Objective adı gerekli.')
    .max(160, 'Objective adı en fazla 160 karakter olabilir.'),
  ownerUserId: z.string().min(1).nullable().default(null),
  krs: z
    .array(
      z.object({
        /** Absent for a newly added key result. */
        id: z.string().min(1).optional(),
        title: z.string().trim().min(3, 'Key result en az 3 karakter olmalı.').max(200),
        start: z.number().finite(),
        current: z.number().finite(),
        target: z.number().finite(),
        unit: z.string().max(8).default(''),
        confidence: z.enum(['high', 'mid', 'low']),
        ownerUserId: z.string().min(1).nullable().default(null),
      }),
    )
    .min(1, 'En az 1 key result gerekli.')
    .max(5, 'En fazla 5 key result eklenebilir.'),
})

export type UpdateObjectiveInput = z.input<typeof updateObjectiveSchema>

/**
 * Rewrites an objective and its key results to match the submitted set.
 *
 * Key results absent from the payload are deleted, which also removes their
 * check-in history — so the caller is told the count first (see
 * `describeObjectiveDeletion`) and the UI confirms before sending.
 */
export async function updateObjectiveFor(
  db: Db,
  user: SessionUser,
  input: UpdateObjectiveInput,
): Promise<ActionResult<{ id: string; deptSlug: string }>> {
  const parsed = updateObjectiveSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Girdi geçersiz.')
  const data = parsed.data

  const [row] = await db
    .select({ objective: objectives, deptSlug: departments.slug, deptId: departments.id })
    .from(objectives)
    .innerJoin(departments, eq(objectives.departmentId, departments.id))
    .where(eq(objectives.id, data.id))
    .limit(1)
  if (!row) return fail('Objective bulunamadı.')

  if (!can(user, 'edit:objective', { departmentId: row.deptId })) return fail(FORBIDDEN)

  if (data.krs.some((k) => k.start === k.target)) {
    return fail('Key result başlangıç ve hedef değeri aynı olamaz.')
  }

  const existing = await db
    .select({ id: keyResults.id })
    .from(keyResults)
    .where(eq(keyResults.objectiveId, data.id))
  const existingIds = new Set(existing.map((k) => k.id))

  // An id the caller does not own must not be adoptable into this objective.
  const submittedIds = data.krs.flatMap((k) => (k.id ? [k.id] : []))
  if (submittedIds.some((id) => !existingIds.has(id))) {
    return fail('Bu objective’e ait olmayan bir key result gönderildi.')
  }

  const keptIds = new Set(submittedIds)
  const removedIds = [...existingIds].filter((id) => !keptIds.has(id))
  const now = new Date()

  await db.transaction(async (tx) => {
    await tx
      .update(objectives)
      .set({
        titleTr: data.title,
        titleEn: data.title,
        ownerUserId: data.ownerUserId ?? row.objective.ownerUserId,
      })
      .where(eq(objectives.id, data.id))

    for (const id of removedIds) {
      await tx.delete(keyResults).where(eq(keyResults.id, id))
    }

    for (const k of data.krs) {
      if (k.id) {
        await tx
          .update(keyResults)
          .set({
            titleTr: k.title,
            titleEn: k.title,
            start: k.start,
            current: k.current,
            target: k.target,
            unit: k.unit ?? '',
            confidence: k.confidence,
            ownerUserId: k.ownerUserId ?? data.ownerUserId ?? row.objective.ownerUserId,
            updatedAt: now,
          })
          .where(eq(keyResults.id, k.id))
      } else {
        await tx.insert(keyResults).values({
          id: `k-${randomUUID()}`,
          objectiveId: data.id,
          titleTr: k.title,
          titleEn: k.title,
          start: k.start,
          current: k.current,
          target: k.target,
          unit: k.unit ?? '',
          confidence: k.confidence,
          ownerUserId: k.ownerUserId ?? data.ownerUserId ?? row.objective.ownerUserId,
          updatedAt: now,
        })
      }
    }
  })

  return ok({ id: data.id, deptSlug: row.deptSlug })
}

export interface ObjectiveDeletionImpact {
  objectiveTitle: string
  keyResults: number
  checkins: number
}

/** What a delete would destroy, so the confirmation can state it plainly. */
export async function describeObjectiveDeletion(
  db: Db,
  user: SessionUser,
  objectiveId: string,
): Promise<ActionResult<ObjectiveDeletionImpact>> {
  const [row] = await db
    .select({ objective: objectives, deptId: departments.id })
    .from(objectives)
    .innerJoin(departments, eq(objectives.departmentId, departments.id))
    .where(eq(objectives.id, objectiveId))
    .limit(1)
  if (!row) return fail('Objective bulunamadı.')
  if (!can(user, 'edit:objective', { departmentId: row.deptId })) return fail(FORBIDDEN)

  const krs = await db
    .select({ id: keyResults.id })
    .from(keyResults)
    .where(eq(keyResults.objectiveId, objectiveId))

  let checkinCount = 0
  for (const k of krs) {
    const [c] = await db
      .select({ n: count() })
      .from(checkins)
      .where(eq(checkins.keyResultId, k.id))
    checkinCount += Number(c?.n ?? 0)
  }

  return ok({
    objectiveTitle: row.objective.titleTr,
    keyResults: krs.length,
    checkins: checkinCount,
  })
}

/**
 * Deletes an objective along with its key results and their check-ins.
 *
 * This is a hard delete: the schema cascades, so the check-in history goes with
 * it. There is no undo, which is why the UI shows the impact first.
 */
export async function deleteObjectiveFor(
  db: Db,
  user: SessionUser,
  input: { id: string },
): Promise<ActionResult<{ id: string; deptSlug: string }>> {
  const [row] = await db
    .select({ deptSlug: departments.slug, deptId: departments.id })
    .from(objectives)
    .innerJoin(departments, eq(objectives.departmentId, departments.id))
    .where(eq(objectives.id, input.id))
    .limit(1)
  if (!row) return fail('Objective bulunamadı.')

  if (!can(user, 'edit:objective', { departmentId: row.deptId })) return fail(FORBIDDEN)

  await db.delete(objectives).where(eq(objectives.id, input.id))
  return ok({ id: input.id, deptSlug: row.deptSlug })
}
