import { and, eq, ne } from 'drizzle-orm'
import { z } from 'zod'
import { can, type SessionUser } from '@/lib/auth/permissions'
import type { Db } from '@/lib/db'
import { periods } from '@/lib/db/schema'
import type { PeriodKind } from '@/lib/domain/types'
import { fail, FORBIDDEN, ok, type ActionResult } from '../types'

/** `2026-Q3` for a quarter, `2026-08` for a month, `2026-FY` for a fiscal year. */
const QUARTER_CODE = /^\d{4}-Q[1-4]$/
const MONTH_CODE = /^\d{4}-(0[1-9]|1[0-2])$/
const YEAR_CODE = /^\d{4}-FY$/

export const createPeriodSchema = z
  .object({
    code: z.string().trim().min(1, 'Dönem kodu gerekli.').max(16),
    kind: z.enum(['quarter', 'month', 'year']),
    startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-AA-GG olmalı.'),
    endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-AA-GG olmalı.'),
  })
  .superRefine((v, ctx) => {
    const pattern =
      v.kind === 'quarter' ? QUARTER_CODE
      : v.kind === 'month' ? MONTH_CODE
      : YEAR_CODE
    if (!pattern.test(v.code)) {
      ctx.addIssue({
        code: 'custom',
        path: ['code'],
        message:
          v.kind === 'quarter' ? 'Çeyrek kodu 2026-Q3 biçiminde olmalı.'
          : v.kind === 'month' ? 'Ay kodu 2026-08 biçiminde olmalı.'
          : 'Mali yıl kodu 2026-FY biçiminde olmalı.',
      })
    }
    if (v.endsOn <= v.startsOn) {
      ctx.addIssue({ code: 'custom', path: ['endsOn'], message: 'Bitiş, başlangıçtan sonra olmalı.' })
    }
  })

export type CreatePeriodInput = z.input<typeof createPeriodSchema>

export async function createPeriodAs(
  db: Db,
  actor: SessionUser,
  input: CreatePeriodInput,
): Promise<ActionResult<{ id: string; code: string; kind: PeriodKind }>> {
  if (!can(actor, 'manage:periods')) return fail(FORBIDDEN)

  const parsed = createPeriodSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Girdi geçersiz.')
  const data = parsed.data

  const [existing] = await db.select().from(periods).where(eq(periods.code, data.code)).limit(1)
  if (existing) return fail('Bu dönem zaten tanımlı.')

  const id = `p-${data.code.toLowerCase()}`
  await db.insert(periods).values({
    id,
    code: data.code,
    kind: data.kind,
    // New periods are planned until someone opens them.
    state: 'planned',
    startsOn: data.startsOn,
    endsOn: data.endsOn,
  })

  return ok({ id, code: data.code, kind: data.kind })
}

export async function setPeriodStateAs(
  db: Db,
  actor: SessionUser,
  input: { periodId: string; state: 'active' | 'closed' | 'planned' },
): Promise<ActionResult<{ id: string }>> {
  if (!can(actor, 'manage:periods')) return fail(FORBIDDEN)

  const parsed = z
    .object({ periodId: z.string().min(1), state: z.enum(['active', 'closed', 'planned']) })
    .safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Girdi geçersiz.')

  const [target] = await db
    .select()
    .from(periods)
    .where(eq(periods.id, parsed.data.periodId))
    .limit(1)
  if (!target) return fail('Dönem bulunamadı.')

  await db.transaction(async (tx) => {
    // At most one active period, full stop. The open period is what new
    // objectives and check-ins attach to, so two of them — even of different
    // kinds — would make that choice arbitrary.
    if (parsed.data.state === 'active') {
      await tx
        .update(periods)
        .set({ state: 'closed' })
        .where(and(eq(periods.state, 'active'), ne(periods.id, target.id)))
    }
    await tx.update(periods).set({ state: parsed.data.state }).where(eq(periods.id, target.id))
  })

  return ok({ id: target.id })
}

export const updatePeriodDatesSchema = z
  .object({
    periodId: z.string().min(1),
    startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-AA-GG olmalı.'),
    endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-AA-GG olmalı.'),
  })
  .superRefine((v, ctx) => {
    if (v.endsOn <= v.startsOn) {
      ctx.addIssue({ code: 'custom', path: ['endsOn'], message: 'Bitiş, başlangıçtan sonra olmalı.' })
    }
  })

export type UpdatePeriodDatesInput = z.input<typeof updatePeriodDatesSchema>

/**
 * Corrects a period's date range.
 *
 * The seed derives quarters from a September fiscal year, but a company can
 * change that, and a mistyped range would otherwise be unfixable from the UI.
 * The code is not editable — it identifies the period everywhere.
 */
export async function updatePeriodDatesAs(
  db: Db,
  actor: SessionUser,
  input: UpdatePeriodDatesInput,
): Promise<ActionResult<{ id: string }>> {
  if (!can(actor, 'manage:periods')) return fail(FORBIDDEN)

  const parsed = updatePeriodDatesSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Girdi geçersiz.')

  const [target] = await db
    .select()
    .from(periods)
    .where(eq(periods.id, parsed.data.periodId))
    .limit(1)
  if (!target) return fail('Dönem bulunamadı.')

  await db
    .update(periods)
    .set({ startsOn: parsed.data.startsOn, endsOn: parsed.data.endsOn })
    .where(eq(periods.id, target.id))

  return ok({ id: target.id })
}
