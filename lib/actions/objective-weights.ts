'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { setObjectiveWeightsFor, type SetObjectiveWeightsInput } from './core/objective-weights'
import type { ActionResult } from './types'

/** Thin wrapper: session + database + cache invalidation. Logic lives in core/. */
export async function setObjectiveWeights(
  input: SetObjectiveWeightsInput,
): Promise<ActionResult<{ deptSlug: string }>> {
  const user = await requireUser()
  const db = await getDb()

  const result = await setObjectiveWeightsFor(db, user, input)

  if (result.ok) {
    revalidatePath('/')
    revalidatePath(`/bolum/${result.data.deptSlug}`)
    revalidatePath('/rapor')
  }
  return result
}
