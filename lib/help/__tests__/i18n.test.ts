import { expect, test } from 'vitest'
import { BUILTIN_HELP } from '../content'
import { HELP_COPY } from '../copy'
import { CATEGORY_LABEL, HELP_CATEGORIES, localizeArticle, type HelpArticle } from '../types'

test('every built-in entry has a non-empty English question and answer', () => {
  const english = BUILTIN_HELP.map((a) => localizeArticle(a, 'en'))
  expect(english).toHaveLength(BUILTIN_HELP.length)
  for (const a of BUILTIN_HELP) {
    expect(a.en, a.id).toBeDefined()
    expect(a.en!.question.trim().length, a.id).toBeGreaterThan(5)
    expect(a.en!.answer.trim().length, a.id).toBeGreaterThan(20)
    // A translation that is just the Turkish copied over is a missed entry.
    expect(a.en!.question, a.id).not.toBe(a.question)
    expect(a.en!.answer, a.id).not.toBe(a.answer)
  }
})

test('English answers keep the markup shape of the Turkish ones', () => {
  const count = (s: string, re: RegExp) => (s.match(re) ?? []).length
  for (const a of BUILTIN_HELP) {
    expect(count(a.en!.answer, /\n\n/g), `${a.id} paragraphs`).toBe(count(a.answer, /\n\n/g))
    expect(count(a.en!.answer, /\*\*/g), `${a.id} bold`).toBe(count(a.answer, /\*\*/g))
    expect(count(a.en!.answer, /`/g), `${a.id} code`).toBe(count(a.answer, /`/g))
  }
})

/** Quotes are dropped: a title with "x" in it is cited as 'x' inside the reference. */
const norm = (s: string) => s.replace(/["']/g, '')

test.each([
  ['tr', /bkz\. "([^"]+)"/g],
  ['en', /see "([^"]+)"/g],
] as const)('every cross-reference in %s names an existing question', (lang, re) => {
  const titles = new Set(BUILTIN_HELP.map((a) => norm(localizeArticle(a, lang).question)))
  let refs = 0
  for (const a of BUILTIN_HELP) {
    for (const m of localizeArticle(a, lang).answer.matchAll(re)) {
      refs++
      expect(titles.has(norm(m[1]!)), `${a.id}: ${m[1]}`).toBe(true)
    }
  }
  expect(refs).toBeGreaterThan(5)
})

test('both languages cite the same number of cross-references per entry', () => {
  for (const a of BUILTIN_HELP) {
    const tr = [...a.answer.matchAll(/bkz\. "/g)].length
    const en = [...a.en!.answer.matchAll(/see "/g)].length
    expect(en, a.id).toBe(tr)
  }
})

test('a team note is shown as written in either language', () => {
  const note: HelpArticle = {
    id: 'x', category: 'other', question: 'Takım notu sorusu', answer: 'Takım notu cevabı burada.',
    source: 'custom', authorName: 'A',
  }
  expect(localizeArticle(note, 'en')).toEqual({ question: note.question, answer: note.answer })
  expect(localizeArticle(note, 'tr')).toEqual({ question: note.question, answer: note.answer })
})

test('Turkish stays the default text of a built-in entry', () => {
  const a = BUILTIN_HELP[0]!
  expect(localizeArticle(a, 'tr')).toEqual({ question: a.question, answer: a.answer })
})

test('category labels and screen copy exist in both languages', () => {
  for (const c of HELP_CATEGORIES) {
    expect(CATEGORY_LABEL[c].tr, c).toBeTruthy()
    expect(CATEGORY_LABEL[c].en, c).toBeTruthy()
  }
  expect(Object.keys(HELP_COPY.en).sort()).toEqual(Object.keys(HELP_COPY.tr).sort())
})
