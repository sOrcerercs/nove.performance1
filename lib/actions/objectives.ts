'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import type { CreateObjectiveInput } from '@/lib/validation/objective'
import {
  createObjectiveFor,
  deleteObjectiveFor,
  describeObjectiveDeletion,
  updateObjectiveFor,
  type ObjectiveDeletionImpact,
  type UpdateObjectiveInput,
} from './core/objectives'
import type { ActionResult } from './types'

/** Thin wrapper: session + database + cache invalidation. Logic lives in core/. */
export async function createObjective(
  input: CreateObjectiveInput,
): Promise<ActionResult<{ id: string; deptSlug: string }>> {
  const user = await requireUser()
  const db = await getDb()

  const result = await createObjectiveFor(db, user, input)

  if (result.ok) {
    revalidatePath('/')
    revalidatePath(`/bolum/${result.data.deptSlug}`)
    revalidatePath('/rapor')
  }
  return result
}

/** Edits an objective and rewrites its key results to the submitted set. */
export async function updateObjective(
  input: UpdateObjectiveInput,
): Promise<ActionResult<{ id: string; deptSlug: string }>> {
  const user = await requireUser()
  const db = await getDb()

  const result = await updateObjectiveFor(db, user, input)

  if (result.ok) {
    revalidatePath('/')
    revalidatePath(`/bolum/${result.data.deptSlug}`)
    revalidatePath(`/objective/${result.data.id}`)
    revalidatePath('/rapor')
  }
  return result
}

/** What deleting this objective would destroy, for the confirmation prompt. */
export async function objectiveDeletionImpact(
  objectiveId: string,
): Promise<ActionResult<ObjectiveDeletionImpact>> {
  const user = await requireUser()
  const db = await getDb()
  return describeObjectiveDeletion(db, user, objectiveId)
}

export async function deleteObjective(input: {
  id: string
}): Promise<ActionResult<{ id: string; deptSlug: string }>> {
  const user = await requireUser()
  const db = await getDb()

  const result = await deleteObjectiveFor(db, user, input)

  if (result.ok) {
    revalidatePath('/')
    revalidatePath(`/bolum/${result.data.deptSlug}`)
    revalidatePath('/rapor')
  }
  return result
}
