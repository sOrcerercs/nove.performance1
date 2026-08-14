'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { submitCheckinFor, type CheckinInput, type CheckinOutcome } from './core/checkins'
import type { ActionResult } from './types'

/** Thin wrapper: session + database + cache invalidation. Logic lives in core/. */
export async function submitCheckin(
  input: CheckinInput,
): Promise<ActionResult<CheckinOutcome>> {
  const user = await requireUser()
  const db = await getDb()

  const result = await submitCheckinFor(db, user, input)

  if (result.ok) {
    revalidatePath('/')
    revalidatePath(`/bolum/${result.data.deptSlug}`)
    revalidatePath(`/objective/${result.data.objectiveId}`)
    revalidatePath('/rapor')
    // The check-in now writes a `kr_monthly_values` row for the current
    // month, which the monthly entry screen reads.
    revalidatePath('/veri-girisi')
  }
  return result
}
