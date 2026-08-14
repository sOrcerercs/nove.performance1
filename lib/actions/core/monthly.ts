/**
 * `keyResults.current` is a DERIVED SUMMARY of `kr_monthly_values`.
 *
 * Nothing outside this file may write it. A second writer would let the summary
 * drift from the rows it summarises, and every screen reads the summary.
 */

import { randomUUID } from 'node:crypto'
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { can, type SessionUser } from '@/lib/auth/permissions'
import type { Db } from '@/lib/db'
import { departments, keyResults, krMonthlyValues, objectives, periods } from '@/lib/db/schema'
import { monthsOfPeriod, rollup } from '@/lib/domain/monthly'
import { fail, FORBIDDEN, ok, type ActionResult } from '../types'

export const setMonthlyValueSchema = z.object({
  krId: z.string().min(1),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Ay YYYY-AA biçiminde olmalı.'),
  value: z.number().finite(),
  note: z.string().trim().max(1000).optional(),
})

export interface SetMonthlyValueInput {
  krId: string
  month: string
  value: number
  note?: string
}

export interface SetMonthlyValueOutcome {
  krId: string
  month: string
  current: number | null
}

export interface UpsertMonthlyValueInput {
  krId: string
  month: string
  value: number
  authorUserId: string
  note?: string
}

/**
 * Inserts or corrects one key result's month row. Does not touch
 * `keyResults.current` — callers still owe a call to `recomputeSummary`
 * afterward, in the same transaction, to bring the derived summary back in
 * line with the row just written.
 *
 * Exported so `checkins.ts` can write the current month through the exact
 * same path a bulk monthly entry does, rather than growing its own copy of
 * this upsert.
 */
export async function upsertMonthlyValue(tx: Db, input: UpsertMonthlyValueInput): Promise<void> {
  const now = new Date()
  await tx
    .insert(krMonthlyValues)
    .values({
      id: `kmv-${randomUUID()}`,
      keyResultId: input.krId,
      month: input.month,
      value: input.value,
      authorUserId: input.authorUserId,
      note: input.note?.length ? input.note : null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [krMonthlyValues.keyResultId, krMonthlyValues.month],
      set: {
        value: input.value,
        authorUserId: input.authorUserId,
        note: input.note?.length ? input.note : null,
        updatedAt: now,
      },
    })
}

export interface RecomputeSummaryOptions {
  /**
   * The key result's `start` value *before* whatever edit prompted this call
   * (a rollup-rule or `start` change from `objectives.ts`) — needed only to
   * resolve the zero-rows case below. Omitted by `setMonthlyValueAs` and
   * `checkins.ts`, which always run this right after writing a month, so
   * there is always at least one row and the zero-rows branch never runs for
   * them regardless.
   */
  priorStart?: number
}

/**
 * Recomputes `keyResults.current` from every `kr_monthly_values` row on file
 * for one key result, and writes it — the ONLY place in the codebase allowed
 * to do so (see the file header).
 *
 * Callers run this inside their own transaction, right after whatever change
 * could leave `current` disagreeing with the rows it summarises: a monthly
 * write (`setMonthlyValueAs`), a check-in (`checkins.ts`), or an edit that
 * changes the rollup rule or `start` (`objectives.ts`). Every one of those
 * calls this instead of assigning `current` — that is the single-writer
 * invariant.
 */
export async function recomputeSummary(
  tx: Db,
  krId: string,
  options?: RecomputeSummaryOptions,
): Promise<number | null> {
  const [kr] = await tx
    .select({ rollup: keyResults.rollup, start: keyResults.start, current: keyResults.current })
    .from(keyResults)
    .where(eq(keyResults.id, krId))
    .limit(1)
  if (!kr) return null

  // `rollup('last', ...)` takes the array's last element, so the rows must
  // arrive in chronological order — never Postgres's incidental heap/scan
  // order. Month strings are `YYYY-MM`, so a plain lexicographic ASC sort is
  // chronological. Without this, a correction to an earlier month (which
  // Postgres may relocate to the end of the heap on update) can make `last`
  // silently pick that older month instead of the true latest one.
  const rows = await tx
    .select({ value: krMonthlyValues.value })
    .from(krMonthlyValues)
    .where(eq(krMonthlyValues.keyResultId, krId))
    .orderBy(asc(krMonthlyValues.month))

  const summary = rollup(kr.rollup, rows.map((r) => r.value))

  let nextCurrent: number
  if (summary !== null) {
    // The normal case: real monthly rows are the only source of truth for
    // `current`, regardless of `start`/`target`/`rollup`.
    nextCurrent = summary
  } else if (options?.priorStart !== undefined && kr.current === options.priorStart) {
    // No months filled at all, and `current` was exactly tracking the OLD
    // `start` — i.e. this key result has never been measured or back-filled.
    // The "not started" invariant (`current === start`) holds either way, so
    // it follows `start` to its new value. `krPct` reads `current === start`
    // as 0% regardless of what `start` is, but writing a literal 0 would be
    // wrong for any key result whose `start` is not 0.
    nextCurrent = kr.start
  } else {
    // No months filled, and `current` was NOT tracking `start` — a key
    // result back-filled through the documented closed-period path (see
    // `createObjectiveFor`) has no monthly rows by construction, yet its
    // `current` is a real, deliberately-entered figure. A recompute that
    // cannot derive anything from rows must never overwrite a value it
    // cannot derive — the closed period has no UI to re-enter it, so
    // clobbering it here would be silent and unrecoverable.
    nextCurrent = kr.current
  }

  await tx.update(keyResults).set({ current: nextCurrent, updatedAt: new Date() }).where(eq(keyResults.id, krId))

  return nextCurrent
}

/**
 * Records one key result's value for one month, then recomputes
 * `keyResults.current` from every month on file for that key result — in the
 * same transaction, so the summary can never disagree with the rows it
 * summarises.
 *
 * The acting user is a parameter rather than a session lookup, which keeps
 * this testable as any role against a real database.
 */
export async function setMonthlyValueAs(
  db: Db,
  actor: SessionUser,
  input: SetMonthlyValueInput,
): Promise<ActionResult<SetMonthlyValueOutcome>> {
  const parsed = setMonthlyValueSchema.safeParse(input)
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
      periodStartsOn: periods.startsOn,
      periodEndsOn: periods.endsOn,
    })
    .from(keyResults)
    .innerJoin(objectives, eq(keyResults.objectiveId, objectives.id))
    .innerJoin(departments, eq(objectives.departmentId, departments.id))
    .innerJoin(periods, eq(objectives.periodId, periods.id))
    .where(eq(keyResults.id, data.krId))
    .limit(1)

  if (!row) return fail('Key result bulunamadı.')

  if (
    !can(actor, 'checkin:kr', {
      departmentId: row.departmentId,
      ownerUserId: row.kr.ownerUserId,
    })
  ) {
    return fail(FORBIDDEN)
  }

  const validMonths = monthsOfPeriod(row.periodStartsOn, row.periodEndsOn)
  if (!validMonths.includes(data.month)) {
    return fail('Bu ay, key result’ın dönemi içinde değil.')
  }

  const current = await db.transaction(async (tx) => {
    await upsertMonthlyValue(tx, {
      krId: data.krId,
      month: data.month,
      value: data.value,
      authorUserId: actor.id,
      note: data.note,
    })
    return recomputeSummary(tx, data.krId)
  })

  return ok({ krId: data.krId, month: data.month, current })
}

export interface SetMonthlyValueItemOutcome {
  krId: string
  month: string
  ok: boolean
  error?: string
  current?: number | null
}

/**
 * Writes several key results' months in one round trip — the bulk entry
 * screen's "one Kaydet writes every changed row" behaviour.
 *
 * Deliberately a thin loop over `setMonthlyValueAs` rather than a bespoke
 * bulk write: each item still gets its own permission check (a batch is not
 * a bigger single resource — one row can be allowed while the next is not)
 * and its own transaction, and `keyResults.current` is still only ever
 * touched inside `setMonthlyValueAs`. Adding a second writer here — even one
 * that meant well, like summing the batch's rows and writing `current` once
 * for efficiency — would be exactly the drift Task 2's single-writer
 * invariant exists to prevent.
 *
 * Sequential, not `Promise.all`: this is a personal, once-a-month bulk entry
 * of a few dozen rows, not a hot path, and running the items one at a time
 * keeps this from ever putting more statements in flight than a single
 * `setMonthlyValueAs` call already does — relevant on a connection pool sized
 * for one request's fan-out. One row failing (a stale permission, a month
 * that fell outside the period) does not stop the rest from saving.
 */
export async function setMonthlyValuesAs(
  db: Db,
  actor: SessionUser,
  items: SetMonthlyValueInput[],
): Promise<ActionResult<SetMonthlyValueItemOutcome[]>> {
  if (items.length === 0) return fail('Kaydedilecek satır yok.')

  const results: SetMonthlyValueItemOutcome[] = []
  for (const item of items) {
    const r = await setMonthlyValueAs(db, actor, item)
    results.push(
      r.ok
        ? { krId: item.krId, month: item.month, ok: true, current: r.data.current }
        : { krId: item.krId, month: item.month, ok: false, error: r.error },
    )
  }

  return ok(results)
}
