import { randomUUID } from 'node:crypto'
import { count, eq } from 'drizzle-orm'
import { can, type SessionUser } from '@/lib/auth/permissions'
import type { Db } from '@/lib/db'
import { checkins, departments, keyResults, objectives, periods } from '@/lib/db/schema'
import { z } from 'zod'
import {
  createObjectiveSchema,
  OBJECTIVE_MESSAGES as M,
  type CreateObjectiveInput,
} from '@/lib/validation/objective'
import { fail, FORBIDDEN, fromIssue, msg, ok, type ActionResult } from '../types'
import { recomputeSummary } from './monthly'

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
    return fail(fromIssue(parsed.error.issues[0]?.message, M))
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
  if (!dept) return fail(msg('Bölüm bulunamadı.', 'Department not found.'))

  const [period] = await db
    .select()
    .from(periods)
    .where(eq(periods.code, data.periodCode))
    .limit(1)
  if (!period) return fail(msg('Dönem bulunamadı.', 'Period not found.'))

  // A key result whose start equals its target can never show progress, so it
  // is rejected here rather than silently rendering 0% forever.
  if (data.krs.some((k) => k.start === k.target)) {
    return fail(msg('Key result başlangıç ve hedef değeri aynı olamaz.', "A key result's start and target values can't be the same."))
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
        rollup: k.rollup,
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
    .min(1, M.titleRequired.tr)
    .max(160, M.titleLong.tr),
  ownerUserId: z.string().min(1).nullable().default(null),
  krs: z
    .array(
      z.object({
        /** Absent for a newly added key result. */
        id: z.string().min(1).optional(),
        title: z.string().trim().min(3, M.krTitleShort.tr).max(200),
        start: z.number().finite(),
        target: z.number().finite(),
        unit: z.string().max(8).default(''),
        confidence: z.enum(['high', 'mid', 'low']),
        // Deliberately no `current` here: `current` is a DERIVED SUMMARY of
        // `kr_monthly_values` (see monthly.ts's file header) and this form has
        // no business assigning it directly. A rollup change recomputes it
        // from the key result's existing monthly rows via `recomputeSummary`;
        // otherwise it is simply left alone.
        //
        // No `.default()` on purpose: a silently-defaulted rollup would let a
        // caller that forgets this field quietly rewrite the rule (and, on a
        // KR with existing monthly rows, its `current`) instead of failing
        // loudly — every caller must say the rule it means.
        rollup: z.enum(['sum', 'avg', 'last']),
        ownerUserId: z.string().min(1).nullable().default(null),
      }),
    )
    .min(1, M.krsMin.tr)
    .max(5, M.krsMax.tr),
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
  if (!parsed.success) return fail(fromIssue(parsed.error.issues[0]?.message, M))
  const data = parsed.data

  const [row] = await db
    .select({ objective: objectives, deptSlug: departments.slug, deptId: departments.id })
    .from(objectives)
    .innerJoin(departments, eq(objectives.departmentId, departments.id))
    .where(eq(objectives.id, data.id))
    .limit(1)
  if (!row) return fail(msg('Objective bulunamadı.', 'Objective not found.'))

  if (!can(user, 'edit:objective', { departmentId: row.deptId })) return fail(FORBIDDEN)

  const existing = await db
    .select({ id: keyResults.id, start: keyResults.start, target: keyResults.target, rollup: keyResults.rollup })
    .from(keyResults)
    .where(eq(keyResults.objectiveId, data.id))
  const existingIds = new Set(existing.map((k) => k.id))
  const existingById = new Map(existing.map((k) => [k.id, k]))

  // A key result whose start equals its target can never show progress, so
  // turning one into that state is rejected here rather than silently
  // rendering 0% forever. Rows that already arrived in that state (the real
  // data has some, deliberately — the source figure was ambiguous and a human
  // still has to supply the missing target) are grandfathered: they keep
  // saving, and the badge in the UI, as long as the save does not newly put
  // them there.
  const newlyUnmeasurable = data.krs.find((k) => {
    if (k.start !== k.target) return false
    const prev = k.id ? existingById.get(k.id) : undefined
    return !prev || prev.start !== prev.target
  })
  if (newlyUnmeasurable) {
    return fail(
      msg(
        `"${newlyUnmeasurable.title}" için başlangıç ve hedef aynı olamaz — bir hedef girin.`,
        `Start and target can't be the same for "${newlyUnmeasurable.title}" — enter a target.`,
      ),
    )
  }

  // An id the caller does not own must not be adoptable into this objective.
  const submittedIds = data.krs.flatMap((k) => (k.id ? [k.id] : []))
  if (submittedIds.some((id) => !existingIds.has(id))) {
    return fail(msg('Bu objective’e ait olmayan bir key result gönderildi.', "A key result that doesn't belong to this objective was sent."))
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
        const prev = existingById.get(k.id)

        await tx
          .update(keyResults)
          .set({
            titleTr: k.title,
            titleEn: k.title,
            start: k.start,
            target: k.target,
            unit: k.unit ?? '',
            confidence: k.confidence,
            rollup: k.rollup,
            ownerUserId: k.ownerUserId ?? data.ownerUserId ?? row.objective.ownerUserId,
            updatedAt: now,
          })
          .where(eq(keyResults.id, k.id))

        // The monthly rows are untouched either way. `recomputeSummary`
        // itself decides what, if anything, changes: when this key result
        // has monthly rows on file, the rollup rule decides how they
        // collapse; when it has none, `start` decides what "not started"
        // means. `target` never needs this — `current`'s derivation (the
        // rollup of the rows, or the zero-rows fallback to `start`) does not
        // depend on `target` in either branch, so a target-only edit is
        // deliberately not a trigger here.
        if (prev && (prev.rollup !== k.rollup || prev.start !== k.start)) {
          await recomputeSummary(tx, k.id, { priorStart: prev.start })
        }
      } else {
        // A brand-new key result has no monthly rows yet, so its summary is
        // simply its start — the same value `recomputeSummary` would derive
        // for zero filled months. Writing it directly here is the insert
        // exemption Task 2's scan already carries (an insert is not a second
        // writer of the derived summary), not a new one.
        await tx.insert(keyResults).values({
          id: `k-${randomUUID()}`,
          objectiveId: data.id,
          titleTr: k.title,
          titleEn: k.title,
          start: k.start,
          current: k.start,
          target: k.target,
          unit: k.unit ?? '',
          confidence: k.confidence,
          rollup: k.rollup,
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
  if (!row) return fail(msg('Objective bulunamadı.', 'Objective not found.'))
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
  if (!row) return fail(msg('Objective bulunamadı.', 'Objective not found.'))

  if (!can(user, 'edit:objective', { departmentId: row.deptId })) return fail(FORBIDDEN)

  await db.delete(objectives).where(eq(objectives.id, input.id))
  return ok({ id: input.id, deptSlug: row.deptSlug })
}
