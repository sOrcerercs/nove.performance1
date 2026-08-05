'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import {
  createHelpArticleAs,
  deleteHelpArticleAs,
  updateHelpArticleAs,
  type CreateHelpArticleInput,
  type UpdateHelpArticleInput,
} from './core/help'
import type { ActionResult } from './types'

export async function createHelpArticle(
  input: CreateHelpArticleInput,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser()
  const db = await getDb()
  const result = await createHelpArticleAs(db, user, input)
  if (result.ok) revalidatePath('/yardim')
  return result
}

export async function updateHelpArticle(
  input: UpdateHelpArticleInput,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser()
  const db = await getDb()
  const result = await updateHelpArticleAs(db, user, input)
  if (result.ok) revalidatePath('/yardim')
  return result
}

export async function deleteHelpArticle(input: {
  id: string
}): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser()
  const db = await getDb()
  const result = await deleteHelpArticleAs(db, user, input)
  if (result.ok) revalidatePath('/yardim')
  return result
}
