import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { can, type SessionUser } from '@/lib/auth/permissions'
import type { Db } from '@/lib/db'
import { appSettings } from '@/lib/db/schema'
import { isValidIsoDate } from '@/lib/domain/dates'
import { DEFAULT_RANGE_START_KEY } from '@/lib/queries/settings'
import { fail, FORBIDDEN, ok, type ActionResult } from '../types'

export const setDefaultRangeStartSchema = z.object({
  startsOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-AA-GG olmalı.')
    .refine(isValidIsoDate, 'Böyle bir takvim günü yok.'),
})

export type SetDefaultRangeStartInput = z.input<typeof setDefaultRangeStartSchema>

/**
 * Moves the start of the default date range.
 *
 * Gated on `manage:periods` — the same permission that edits period dates, and
 * for the same reason: both decide which data a screen opens on.
 */
export async function setDefaultRangeStartAs(
  db: Db,
  actor: SessionUser,
  input: SetDefaultRangeStartInput,
): Promise<ActionResult<{ startsOn: string }>> {
  if (!can(actor, 'manage:periods')) return fail(FORBIDDEN)

  const parsed = setDefaultRangeStartSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Girdi geçersiz.')

  await db
    .insert(appSettings)
    .values({ key: DEFAULT_RANGE_START_KEY, value: parsed.data.startsOn })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: sql`excluded.value` },
    })

  return ok({ startsOn: parsed.data.startsOn })
}
