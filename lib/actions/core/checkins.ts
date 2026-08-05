import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { can, type SessionUser } from '@/lib/auth/permissions'
import type { Db } from '@/lib/db'
import { checkins, departments, keyResults, objectives } from '@/lib/db/schema'
import { krPct } from '@/lib/domain/progress'
import type { Confidence } from '@/lib/domain/types'
import { fail, FORBIDDEN, ok, type ActionResult } from '../types'

export const checkinSchema = z.object({
  keyResultId: z.string().min(1),
  newValue: z.number().finite(),
  confidence: z.enum(['high', 'mid', 'low']),
  note: z.string().trim().max(1000).optional(),
})

export interface CheckinInput {
  keyResultId: string
  newValue: number
  confidence: Confidence
  note?: string
}

export interface CheckinOutcome {
  pct: number
  previousValue: number
  deptSlug: string
  objectiveId: string
}

/**
 * Records a weekly check-in: updates the key result and writes an audit row,
 * in one transaction so the two can never disagree.
 *
 * The acting user is a parameter rather than a session lookup, which keeps this
 * testable as any role against a real database.
 */
export async function submitCheckinFor(
  db: Db,
  user: SessionUser,
  input: CheckinInput,
): Promise<ActionResult<CheckinOutcome>> {
  const parsed = checkinSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Girdi geçersiz.')
  }
  const data = parsed.data

  // The department is resolved from the key result itself, so a caller cannot
  // name a department they do happen to lead in order to pass the check.
  const [row] = await db
    .select({
      kr: keyResults,
      departmentId: objectives.departmentId,
      deptSlug: departments.slug,
    })
    .from(keyResults)
    .innerJoin(objectives, eq(keyResults.objectiveId, objectives.id))
    .innerJoin(departments, eq(objectives.departmentId, departments.id))
    .where(eq(keyResults.id, data.keyResultId))
    .limit(1)

  if (!row) return fail('Key result bulunamadı.')

  if (
    !can(user, 'checkin:kr', {
      departmentId: row.departmentId,
      ownerUserId: row.kr.ownerUserId,
    })
  ) {
    return fail(FORBIDDEN)
  }

  const previousValue = row.kr.current
  const now = new Date()

  await db.transaction(async (tx) => {
    await tx
      .update(keyResults)
      .set({ current: data.newValue, confidence: data.confidence, updatedAt: now })
      .where(eq(keyResults.id, data.keyResultId))

    await tx.insert(checkins).values({
      id: `c-${randomUUID()}`,
      keyResultId: data.keyResultId,
      authorUserId: user.id,
      previousValue,
      newValue: data.newValue,
      confidence: data.confidence,
      note: data.note?.length ? data.note : null,
      createdAt: now,
    })
  })

  return ok({
    pct: krPct({ start: row.kr.start, current: data.newValue, target: row.kr.target }),
    previousValue,
    deptSlug: row.deptSlug,
    objectiveId: row.kr.objectiveId,
  })
}
