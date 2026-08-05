import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { can, type SessionUser } from '@/lib/auth/permissions'
import type { Db } from '@/lib/db'
import { helpArticles } from '@/lib/db/schema'
import { HELP_CATEGORIES } from '@/lib/help/types'
import { fail, FORBIDDEN, ok, type ActionResult } from '../types'

const categorySchema = z.enum(HELP_CATEGORIES as unknown as [string, ...string[]])

const articleSchema = z.object({
  category: categorySchema,
  question: z
    .string()
    .trim()
    .min(5, 'Soru en az 5 karakter olmalı.')
    .max(200, 'Soru en fazla 200 karakter olabilir.'),
  answer: z
    .string()
    .trim()
    .min(10, 'Cevap en az 10 karakter olmalı.')
    .max(4000, 'Cevap en fazla 4000 karakter olabilir.'),
})

export const createHelpArticleSchema = articleSchema
export const updateHelpArticleSchema = articleSchema.extend({ id: z.string().min(1) })

export type CreateHelpArticleInput = z.input<typeof createHelpArticleSchema>
export type UpdateHelpArticleInput = z.input<typeof updateHelpArticleSchema>

export async function createHelpArticleAs(
  db: Db,
  actor: SessionUser,
  input: CreateHelpArticleInput,
): Promise<ActionResult<{ id: string }>> {
  if (!can(actor, 'manage:help')) return fail(FORBIDDEN)

  const parsed = createHelpArticleSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Girdi geçersiz.')

  const id = `h-${randomUUID()}`
  await db.insert(helpArticles).values({
    id,
    category: parsed.data.category as never,
    question: parsed.data.question,
    answer: parsed.data.answer,
    authorUserId: actor.id,
    updatedAt: new Date(),
  })

  return ok({ id })
}

export async function updateHelpArticleAs(
  db: Db,
  actor: SessionUser,
  input: UpdateHelpArticleInput,
): Promise<ActionResult<{ id: string }>> {
  if (!can(actor, 'manage:help')) return fail(FORBIDDEN)

  const parsed = updateHelpArticleSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Girdi geçersiz.')

  const [existing] = await db
    .select()
    .from(helpArticles)
    .where(eq(helpArticles.id, parsed.data.id))
    .limit(1)
  // Built-in entries live in the source tree, so there is nothing here to edit.
  if (!existing) return fail('Bu kayıt düzenlenemez — yerleşik rehber kodda tutulur.')

  await db
    .update(helpArticles)
    .set({
      category: parsed.data.category as never,
      question: parsed.data.question,
      answer: parsed.data.answer,
      authorUserId: actor.id,
      updatedAt: new Date(),
    })
    .where(eq(helpArticles.id, parsed.data.id))

  return ok({ id: parsed.data.id })
}

export async function deleteHelpArticleAs(
  db: Db,
  actor: SessionUser,
  input: { id: string },
): Promise<ActionResult<{ id: string }>> {
  if (!can(actor, 'manage:help')) return fail(FORBIDDEN)

  const [existing] = await db
    .select()
    .from(helpArticles)
    .where(eq(helpArticles.id, input.id))
    .limit(1)
  if (!existing) return fail('Bu kayıt silinemez — yerleşik rehber kodda tutulur.')

  await db.delete(helpArticles).where(eq(helpArticles.id, input.id))
  return ok({ id: input.id })
}
