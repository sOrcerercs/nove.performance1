import { z } from 'zod'
import { msg } from '@/lib/actions/types'

/**
 * Validation messages in both languages. Zod messages must be strings, so the
 * schemas carry `.tr`; the server action maps a failure back to its entry with
 * `fromIssue`.
 */
export const OBJECTIVE_MESSAGES = {
  krTitleShort: msg('Key result en az 3 karakter olmalı.', 'Key result must be at least 3 characters.'),
  titleRequired: msg('Objective adı gerekli.', 'Objective name is required.'),
  titleLong: msg(
    'Objective adı en fazla 160 karakter olabilir.',
    'Objective name can be at most 160 characters.',
  ),
  departmentRequired: msg('Bölüm seçilmeli.', 'Select a department.'),
  krsMin: msg('En az 1 key result gerekli.', 'At least 1 key result is required.'),
  krsMax: msg('En fazla 5 key result eklenebilir.', 'You can add at most 5 key results.'),
}
const M = OBJECTIVE_MESSAGES

/**
 * One schema, used by both the wizard's live validation and the server action.
 * Keeping a single definition is what stops the two from drifting — the client
 * must never be able to construct input the server would have rejected.
 */
export const krDraftSchema = z.object({
  title: z.string().trim().min(3, M.krTitleShort.tr).max(200),
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
    .min(1, M.titleRequired.tr)
    .max(160, M.titleLong.tr),
  departmentId: z.string().min(1, M.departmentRequired.tr),
  ownerUserId: z.string().min(1).nullable().default(null),
  periodCode: z.string().min(1),
  krs: z
    .array(krDraftSchema)
    .min(1, M.krsMin.tr)
    .max(5, M.krsMax.tr),
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
