'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import type { PeriodKind, Role } from '@/lib/domain/types'
import {
  createPeriodAs,
  setPeriodStateAs,
  updatePeriodDatesAs,
  type CreatePeriodInput,
  type UpdatePeriodDatesInput,
} from './core/periods'
import {
  changeOwnPasswordAs,
  createUserAs,
  deleteUserAs,
  setUserPasswordAs,
  setUserRoleAs,
  setUserStateAs,
  type CreateUserInput,
} from './core/users'
import type { ActionResult } from './types'

/**
 * Thin wrappers over the permission-checked cores.
 *
 * Everything exported from a `'use server'` module becomes a callable RPC
 * endpoint, so none of these may take the acting user as a parameter — each
 * reads it from the session instead.
 */

export async function createUser(input: CreateUserInput): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser()
  const db = await getDb()
  const result = await createUserAs(db, user, input)
  if (result.ok) revalidatePath('/yonetim')
  return result
}

export async function setUserRole(input: {
  userId: string
  role: Role
}): Promise<ActionResult<{ id: string; role: Role }>> {
  const user = await requireUser()
  const db = await getDb()
  const result = await setUserRoleAs(db, user, input)
  if (result.ok) revalidatePath('/yonetim')
  return result
}

export async function setUserState(input: {
  userId: string
  state: 'active' | 'passive'
}): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser()
  const db = await getDb()
  const result = await setUserStateAs(db, user, input)
  if (result.ok) revalidatePath('/yonetim')
  return result
}

export async function deleteUser(input: {
  userId: string
}): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser()
  const db = await getDb()
  const result = await deleteUserAs(db, user, input)
  if (result.ok) revalidatePath('/yonetim')
  return result
}

export async function setUserPassword(input: {
  userId: string
  password: string
}): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser()
  const db = await getDb()
  const result = await setUserPasswordAs(db, user, input)
  if (result.ok) revalidatePath('/yonetim')
  return result
}

export async function changeOwnPassword(input: {
  currentPassword: string
  newPassword: string
}): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser()
  const db = await getDb()
  return changeOwnPasswordAs(db, user, input)
}

export async function createPeriod(
  input: CreatePeriodInput,
): Promise<ActionResult<{ id: string; code: string; kind: PeriodKind }>> {
  const user = await requireUser()
  const db = await getDb()
  const result = await createPeriodAs(db, user, input)
  if (result.ok) revalidatePath('/yonetim')
  return result
}

export async function setPeriodState(input: {
  periodId: string
  state: 'active' | 'closed' | 'planned'
}): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser()
  const db = await getDb()
  const result = await setPeriodStateAs(db, user, input)
  if (result.ok) revalidatePath('/yonetim')
  return result
}

export async function updatePeriodDates(
  input: UpdatePeriodDatesInput,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser()
  const db = await getDb()
  const result = await updatePeriodDatesAs(db, user, input)
  if (result.ok) {
    revalidatePath('/', 'layout')
    revalidatePath('/yonetim')
  }
  return result
}
