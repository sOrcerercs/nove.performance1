import { z } from 'zod'

/**
 * One schema, used by both the wizard's live validation and the server action.
 * Keeping a single definition is what stops the two from drifting — the client
 * must never be able to construct input the server would have rejected.
 */
export const krDraftSchema = z.object({
  title: z.string().trim().min(3, 'Key result en az 3 karakter olmalı.').max(200),
  start: z.number().finite(),
  /**
   * Where the measurement stands now. Optional: a brand-new key result sits at
   * its start value, but historical entry needs the achieved figure straight
   * away rather than a second pass through the editor.
   */
  current: z.number().finite().optional(),
  target: z.number().finite(),
  unit: z.string().max(8).default(''),
  /** Who is responsible. Falls back to the objective owner when absent. */
  ownerUserId: z.string().min(1).nullable().default(null),
})

export const createObjectiveSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Objective adı gerekli.')
    .max(160, 'Objective adı en fazla 160 karakter olabilir.'),
  departmentId: z.string().min(1, 'Bölüm seçilmeli.'),
  ownerUserId: z.string().min(1).nullable().default(null),
  periodCode: z.string().min(1),
  krs: z
    .array(krDraftSchema)
    .min(1, 'En az 1 key result gerekli.')
    .max(5, 'En fazla 5 key result eklenebilir.'),
})

export type CreateObjectiveInput = z.input<typeof createObjectiveSchema>
export type CreateObjectiveParsed = z.output<typeof createObjectiveSchema>

/**
 * The prototype's inline coaching hint under the title field. Outcome-shaped
 * titles are longer and contain a verb; the short-title nudge fires under 12
 * characters, matching the prototype's threshold.
 */
export function titleHint(title: string): 'ok' | 'short' | 'empty' {
  const t = title.trim()
  if (t.length === 0) return 'empty'
  return t.length < 12 ? 'short' : 'ok'
}
