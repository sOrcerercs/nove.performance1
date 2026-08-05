import { asc } from 'drizzle-orm'
import type { Db } from '@/lib/db'
import { helpArticles, users } from '@/lib/db/schema'
import { BUILTIN_HELP } from '@/lib/help/content'
import type { HelpArticle } from '@/lib/help/types'

/**
 * The built-in guide plus whatever the admin has added.
 *
 * Built-in entries come first within each category: they describe how the app
 * behaves and are the answers most people are looking for, while custom ones are
 * the team's own accumulated notes.
 */
export async function getHelpArticles(db: Db): Promise<HelpArticle[]> {
  const [rows, userRows] = await Promise.all([
    db.select().from(helpArticles).orderBy(asc(helpArticles.sortOrder), asc(helpArticles.question)),
    db.select().from(users),
  ])

  const nameById = new Map(userRows.map((u) => [u.id, u.name]))

  const custom: HelpArticle[] = rows.map((r) => ({
    id: r.id,
    category: r.category,
    question: r.question,
    answer: r.answer,
    source: 'custom',
    authorName: r.authorUserId ? (nameById.get(r.authorUserId) ?? '') : '',
  }))

  return [...BUILTIN_HELP, ...custom]
}
