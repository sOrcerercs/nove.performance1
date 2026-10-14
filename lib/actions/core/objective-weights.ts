import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { can, type SessionUser } from '@/lib/auth/permissions'
import type { Db } from '@/lib/db'
import { departments, objectives } from '@/lib/db/schema'
import { checkWeights, weightTotal } from '@/lib/domain/weights'
import { weightProblemMessage } from '@/lib/validation/objective'
import { fail, FORBIDDEN, INVALID_INPUT, msg, ok, type ActionResult } from '../types'

export const OBJECTIVE_WEIGHT_MESSAGES = {
  partial: msg('Ağırlık ya her objective’e girilmeli ya hiçbirine.', 'Enter a weight for every objective, or for none.'),
  stale: msg('Objective listesi değişmiş, sayfayı yenileyin.', 'The objective list has changed; reload the page.'),
}
const M = OBJECTIVE_WEIGHT_MESSAGES

const setObjectiveWeightsSchema = z.object({
  departmentId: z.string().min(1),
  periodId: z.string().min(1),
  weights: z
    .array(z.object({ objectiveId: z.string().min(1), weight: z.number().finite().nullable() }))
    .min(1),
})

export type SetObjectiveWeightsInput = z.input<typeof setObjectiveWeightsSchema>

/**
 * Replaces the weights of one department's objectives in one period, as a set.
 *
 * The caller must send every objective of that department and period, no more
 * and no fewer: objectives are added one at a time, so a form opened before
 * someone added one would otherwise save a "complete" set that silently leaves
 * the newcomer out. Refusing it as stale is the only safe answer.
 *
 * Kept free of `requireUser()` and `getDb()` so it can be tested directly
 * against PGlite as any role; ../objective-weights.ts supplies those two.
 */
export async function setObjectiveWeightsFor(
  db: Db,
  user: SessionUser,
  input: SetObjectiveWeightsInput,
): Promise<ActionResult<{ deptSlug: string }>> {
  const parsed = setObjectiveWeightsSchema.safeParse(input)
  if (!parsed.success) return fail(INVALID_INPUT)
  const data = parsed.data

  if (!can(user, 'manage:objective-weights', { departmentId: data.departmentId })) {
    return fail(FORBIDDEN)
  }

  const [dept] = await db
    .select()
    .from(departments)
    .where(eq(departments.id, data.departmentId))
    .limit(1)
  if (!dept) return fail(msg('Bölüm bulunamadı.', 'Department not found.'))

  const rows = await db
    .select({ id: objectives.id })
    .from(objectives)
    .where(and(eq(objectives.departmentId, dept.id), eq(objectives.periodId, data.periodId)))
  const current = new Set(rows.map((r) => r.id))
  const sent = data.weights.map((w) => w.objectiveId)
  if (
    sent.length !== current.size ||
    new Set(sent).size !== sent.length ||
    sent.some((id) => !current.has(id))
  ) {
    return fail(M.stale)
  }

  const ws = data.weights.map((w) => w.weight)
  const problem = checkWeights(ws, { required: false })
  if (problem === 'partial') return fail(M.partial)
  if (problem) return fail(weightProblemMessage(problem, weightTotal(ws)))

  await db.transaction(async (tx) => {
    for (const w of data.weights) {
      await tx.update(objectives).set({ weight: w.weight }).where(eq(objectives.id, w.objectiveId))
    }
  })

  return ok({ deptSlug: dept.slug })
}
