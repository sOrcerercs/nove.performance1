import { expect, test } from 'vitest'
import {
  createHelpArticleAs,
  deleteHelpArticleAs,
  updateHelpArticleAs,
} from '@/lib/actions/core/help'
import type { SessionUser } from '@/lib/auth/permissions'
import { createTestDb } from '@/lib/db'
import { helpArticles } from '@/lib/db/schema'
import { seed } from '@/lib/db/seed'
import type { Role } from '@/lib/domain/types'
import { getHelpArticles } from '@/lib/queries/help'
import { BUILTIN_HELP } from '../content'
import { HELP_CATEGORIES } from '../types'

async function seeded() {
  const db = await createTestDb()
  await seed(db)
  return db
}

const actor = (role: Role): SessionUser => ({
  id: 'u-kagan.ozturk', name: 'Kağan Öztürk', email: 'e@nove.group', role, departmentId: null,
})

const valid = {
  category: 'admin' as const,
  question: 'Bir çalışan işten ayrılınca ne yapmalıyım?',
  answer: 'Kişiyi silmeyin, Yönetim ekranından **pasifleştirin**. Mevcut atamaları korunur.',
}

test('the built-in guide is non-empty and uses only known categories', () => {
  expect(BUILTIN_HELP.length).toBeGreaterThan(15)
  for (const a of BUILTIN_HELP) {
    expect(HELP_CATEGORIES, a.id).toContain(a.category)
    expect(a.source).toBe('builtin')
    expect(a.question.length, a.id).toBeGreaterThan(5)
    expect(a.answer.length, a.id).toBeGreaterThan(20)
  }
})

test('built-in ids are unique', () => {
  const ids = BUILTIN_HELP.map((a) => a.id)
  expect(new Set(ids).size).toBe(ids.length)
})

test('an admin adds a question and it appears after the built-in guide', async () => {
  const db = await seeded()
  expect((await createHelpArticleAs(db, actor('admin'), valid)).ok).toBe(true)

  const all = await getHelpArticles(db)
  expect(all).toHaveLength(BUILTIN_HELP.length + 1)

  const custom = all.filter((a) => a.source === 'custom')
  expect(custom).toHaveLength(1)
  expect(custom[0]?.question).toBe(valid.question)
  expect(custom[0]?.authorName).toBe('Kağan Öztürk')
  expect(all[0]?.source).toBe('builtin')
})

test('too short a question or answer is refused', async () => {
  const db = await seeded()
  expect((await createHelpArticleAs(db, actor('admin'), { ...valid, question: 'Kısa' })).ok).toBe(false)
  expect((await createHelpArticleAs(db, actor('admin'), { ...valid, answer: 'Az' })).ok).toBe(false)
})

test('only an admin may write the guide', async () => {
  const db = await seeded()
  for (const role of ['executive', 'staff'] as const) {
    expect((await createHelpArticleAs(db, actor(role), valid)).ok, role).toBe(false)
  }
  expect(await db.select().from(helpArticles)).toHaveLength(0)
})

test('a custom question can be edited and deleted', async () => {
  const db = await seeded()
  const created = await createHelpArticleAs(db, actor('admin'), valid)
  if (!created.ok) return

  const upd = await updateHelpArticleAs(db, actor('admin'), {
    id: created.data.id,
    category: 'account',
    question: 'Güncellenmiş soru metni burada',
    answer: 'Güncellenmiş cevap metni burada, yeterince uzun.',
  })
  expect(upd.ok).toBe(true)

  const afterEdit = (await getHelpArticles(db)).find((a) => a.id === created.data.id)
  expect(afterEdit?.category).toBe('account')

  expect((await deleteHelpArticleAs(db, actor('admin'), { id: created.data.id })).ok).toBe(true)
  expect(await db.select().from(helpArticles)).toHaveLength(0)
})

test('a built-in entry cannot be edited or deleted through the database', async () => {
  const db = await seeded()
  const builtinId = BUILTIN_HELP[0]!.id

  expect((await updateHelpArticleAs(db, actor('admin'), { ...valid, id: builtinId })).ok).toBe(false)
  expect((await deleteHelpArticleAs(db, actor('admin'), { id: builtinId })).ok).toBe(false)
  expect((await getHelpArticles(db)).some((a) => a.id === builtinId)).toBe(true)
})

test('an unknown id is refused', async () => {
  const db = await seeded()
  expect((await deleteHelpArticleAs(db, actor('admin'), { id: 'yok' })).ok).toBe(false)
})
