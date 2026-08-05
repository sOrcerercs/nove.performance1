'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import {
  createDepartmentAs,
  deleteDepartmentAs,
  describeDepartmentDeletion,
  moveDepartmentAs,
  updateDepartmentAs,
  type CreateDepartmentInput,
  type DepartmentDeletionImpact,
  type UpdateDepartmentInput,
} from './core/departments'
import type { ActionResult } from './types'

/**
 * Thin wrappers. Nothing here takes the acting user as a parameter: every
 * export of a `'use server'` module is a callable endpoint, so the actor must
 * come from the session.
 */

/** The sidebar and every screen list departments, so revalidate broadly. */
function revalidateAll(slug?: string): void {
  revalidatePath('/', 'layout')
  revalidatePath('/yonetim')
  revalidatePath('/rapor')
  if (slug) revalidatePath(`/bolum/${slug}`)
}

export async function createDepartment(
  input: CreateDepartmentInput,
): Promise<ActionResult<{ id: string; slug: string }>> {
  const user = await requireUser()
  const db = await getDb()

  const result = await createDepartmentAs(db, user, input)
  if (result.ok) revalidateAll(result.data.slug)
  return result
}

export async function updateDepartment(
  input: UpdateDepartmentInput,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser()
  const db = await getDb()

  const result = await updateDepartmentAs(db, user, input)
  if (result.ok) revalidateAll()
  return result
}

/** What deleting this department would cost, for the confirmation prompt. */
export async function departmentDeletionImpact(
  departmentId: string,
): Promise<ActionResult<DepartmentDeletionImpact>> {
  const user = await requireUser()
  const db = await getDb()
  return describeDepartmentDeletion(db, user, departmentId)
}

export async function deleteDepartment(input: {
  id: string
}): Promise<ActionResult<{ id: string; detachedUsers: number }>> {
  const user = await requireUser()
  const db = await getDb()

  const result = await deleteDepartmentAs(db, user, input)
  if (result.ok) revalidateAll()
  return result
}

export async function moveDepartment(input: {
  id: string
  direction: 'up' | 'down'
}): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser()
  const db = await getDb()

  const result = await moveDepartmentAs(db, user, input)
  if (result.ok) revalidateAll()
  return result
}
