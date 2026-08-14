import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { can, type SessionUser } from '@/lib/auth/permissions'
import type { Db } from '@/lib/db'
import { checkins, departments, keyResults, krMonthlyValues, objectives } from '@/lib/db/schema'
import { todayInIstanbul } from '@/lib/domain/dates'
import { krPct } from '@/lib/domain/progress'
import type { Confidence } from '@/lib/domain/types'
import { fail, FORBIDDEN, ok, type ActionResult } from '../types'
import { recomputeSummary, upsertMonthlyValue } from './monthly'

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
 * Records a weekly check-in: writes the current Istanbul month's value —
 * through the same `upsertMonthlyValue` + `recomputeSummary` path
 * `setMonthlyValueAs` uses, so `keyResults.current` is never assigned here
 * directly — updates the confidence badge, and writes an audit row, all in
 * one transaction so none of the three can disagree.
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

  const now = new Date()
  // "Current" means Istanbul's month, not the server's — the same reason
  // `todayInIstanbul` exists for the date-range filter.
  const month = todayInIstanbul(now).slice(0, 7)

  const { current, previousValue } = await db.transaction(async (tx) => {
    // What this specific month held before this check-in — not the key
    // result's whole derived summary, which a `sum`/`avg` rollup could put
    // far from any one month's own figure. No entry yet for this month reads
    // as the key result's own starting point, the same convention
    // `recomputeSummary` uses for "nothing measured yet".
    const [existingMonth] = await tx
      .select({ value: krMonthlyValues.value })
      .from(krMonthlyValues)
      .where(and(eq(krMonthlyValues.keyResultId, data.keyResultId), eq(krMonthlyValues.month, month)))
      .limit(1)
    const previousValue = existingMonth?.value ?? row.kr.start

    await upsertMonthlyValue(tx, {
      krId: data.keyResultId,
      month,
      value: data.newValue,
      authorUserId: user.id,
      note: data.note,
    })
    const current = await recomputeSummary(tx, data.keyResultId)

    await tx
      .update(keyResults)
      .set({ confidence: data.confidence, updatedAt: now })
      .where(eq(keyResults.id, data.keyResultId))

    await tx.insert(checkins).values({
      id: `c-${randomUUID()}`,
      keyResultId: data.keyResultId,
      authorUserId: user.id,
      previousValue,
      newValue: data.newValue,
      confidence: data.confidence,
      note: data.note?.length ? data.note : null,
      month,
      createdAt: now,
    })

    return { current, previousValue }
  })

  return ok({
    pct: krPct({ start: row.kr.start, current: current ?? row.kr.start, target: row.kr.target }),
    previousValue,
    deptSlug: row.deptSlug,
    objectiveId: row.kr.objectiveId,
  })
}
