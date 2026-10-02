'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { useToast } from '@/components/ui/ToastProvider'
import {
  createHelpArticle,
  deleteHelpArticle,
  updateHelpArticle,
} from '@/lib/actions/help'
import { groupByCategory } from '@/lib/help/content'
import { HELP_COPY } from '@/lib/help/copy'
import { matchesQuery } from '@/lib/help/search'
import {
  CATEGORY_LABEL,
  HELP_CATEGORIES,
  localizeArticle,
  type HelpArticle,
  type HelpCategory,
} from '@/lib/help/types'
import { tx } from '@/lib/i18n/strings'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import { RichText } from './RichText'
import styles from './help.module.css'

interface Draft {
  id: string | null
  category: HelpCategory
  question: string
  answer: string
}

const emptyDraft = (): Draft => ({ id: null, category: 'other', question: '', answer: '' })

export function HelpClient({
  articles,
  canManage,
}: {
  articles: HelpArticle[]
  canManage: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const { lang } = usePrefs()
  const c = HELP_COPY[lang]

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<HelpCategory | 'all'>('all')
  const [open, setOpen] = useState<Set<string>>(new Set())

  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  // Built-ins in the interface language; team notes as written.
  const localized = useMemo(
    () => articles.map((a) => ({ ...a, shown: localizeArticle(a, lang) })),
    [articles, lang],
  )

  const filtered = useMemo(() => {
    const q = query.trim()
    return localized.filter((a) => {
      if (category !== 'all' && a.category !== category) return false
      if (!q) return true
      // The answer is searched too: people describe their problem, not the
      // heading it happens to live under. Both languages of a built-in entry
      // are searched, so a Turkish term still finds it in the English guide.
      return matchesQuery(
        `${a.question} ${a.answer} ${a.en?.question ?? ''} ${a.en?.answer ?? ''}`,
        q,
      )
    })
  }, [localized, query, category])

  const grouped = useMemo(() => groupByCategory(filtered), [filtered])

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  async function save() {
    if (!draft) return
    setPending(true)
    setError(null)

    const result = draft.id
      ? await updateHelpArticle({
          id: draft.id,
          category: draft.category,
          question: draft.question,
          answer: draft.answer,
        })
      : await createHelpArticle({
          category: draft.category,
          question: draft.question,
          answer: draft.answer,
        })

    if (result.ok) {
      toast(draft.id ? c.toastUpdated : c.toastAdded)
      setDraft(null)
      router.refresh()
    } else {
      setError(tx(result.error, lang))
    }
    setPending(false)
  }

  async function remove(id: string) {
    setPending(true)
    setError(null)
    const result = await deleteHelpArticle({ id })
    if (result.ok) {
      toast(c.toastDeleted)
      setConfirmDelete(null)
      router.refresh()
    } else {
      setError(tx(result.error, lang))
    }
    setPending(false)
  }

  const draftValid =
    draft !== null && draft.question.trim().length >= 5 && draft.answer.trim().length >= 10

  return (
    <>
      <h1 className={styles.h1}>{c.title}</h1>
      <p className={styles.lead}>{c.lead}</p>

      <div className={styles.searchRow}>
        <input
          className={styles.search}
          placeholder={c.searchPlaceholder}
          aria-label={c.searchLabel}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className={styles.count}>
          {filtered.length} / {articles.length} {c.countUnit}
        </span>
        {canManage ? (
          <button
            type="button"
            className={styles.addBtn}
            onClick={() => {
              setDraft(emptyDraft())
              setError(null)
            }}
          >
            {c.addQuestion}
          </button>
        ) : null}
      </div>

      <div className={styles.chips}>
        <button
          type="button"
          className={`${styles.chip} ${category === 'all' ? styles.chipActive : ''}`}
          aria-pressed={category === 'all'}
          onClick={() => setCategory('all')}
        >
          {c.all}
        </button>
        {HELP_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            className={`${styles.chip} ${category === cat ? styles.chipActive : ''}`}
            aria-pressed={category === cat}
            onClick={() => setCategory(cat)}
          >
            {tx(CATEGORY_LABEL[cat], lang)}
          </button>
        ))}
      </div>

      {draft ? (
        <div className={styles.editor}>
          <h2 className={styles.editorTitle}>
            {draft.id ? c.editTitle : c.newTitle}
          </h2>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="h-cat">{c.category}</label>
            <select
              id="h-cat"
              className={styles.select}
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value as HelpCategory })}
            >
              {HELP_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{tx(CATEGORY_LABEL[cat], lang)}</option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="h-q">{c.question}</label>
            <input
              id="h-q"
              className={styles.input}
              placeholder={c.questionPlaceholder}
              value={draft.question}
              onChange={(e) => setDraft({ ...draft, question: e.target.value })}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="h-a">{c.answer}</label>
            <textarea
              id="h-a"
              className={styles.textarea}
              placeholder={c.answerPlaceholder}
              value={draft.answer}
              onChange={(e) => setDraft({ ...draft, answer: e.target.value })}
            />
            <p className={styles.hint}>
              {c.formatHint} <code>{c.formatBold}</code> · <code>{c.formatCode}</code> ·{' '}
              {c.formatRest}
            </p>
          </div>

          {draft.answer.trim() ? (
            <div className={styles.previewBox}>
              <div className={styles.previewLabel}>{c.preview}</div>
              <RichText text={draft.answer} />
            </div>
          ) : null}

          {error ? <p className={styles.error} role="alert">{error}</p> : null}

          <div className={styles.editorActions}>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => { setDraft(null); setError(null) }}
            >
              {c.cancel}
            </button>
            <button
              type="button"
              className={styles.primary}
              disabled={!draftValid || pending}
              onClick={save}
            >
              {pending ? '…' : c.save}
            </button>
          </div>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className={styles.card}>
          <p className={styles.empty}>{c.noResults(query)}</p>
        </div>
      ) : null}

      {HELP_CATEGORIES.filter((cat) => grouped.has(cat)).map((cat) => (
        <section className={styles.section} key={cat}>
          <h2 className={styles.sectionTitle}>{tx(CATEGORY_LABEL[cat], lang)}</h2>
          <div className={styles.card}>
            {(grouped.get(cat) ?? []).map((a) => {
              const isOpen = open.has(a.id)
              return (
                <div className={styles.item} key={a.id}>
                  <button
                    type="button"
                    className={styles.question}
                    aria-expanded={isOpen}
                    onClick={() => toggle(a.id)}
                  >
                    <span className={styles.chevron} aria-hidden="true">
                      {isOpen ? '▾' : '▸'}
                    </span>
                    <span className={styles.questionText}>{a.shown.question}</span>
                    {a.source === 'custom' ? (
                      <span className={styles.customTag}>{c.customTag}</span>
                    ) : null}
                  </button>

                  {isOpen ? (
                    <div className={styles.answer}>
                      <RichText text={a.shown.answer} />

                      {a.source === 'custom' && a.authorName ? (
                        <p className={styles.meta}>{c.addedBy} {a.authorName}</p>
                      ) : null}

                      {canManage && a.source === 'custom' ? (
                        <div className={styles.itemActions}>
                          <button
                            type="button"
                            className={styles.linkBtn}
                            disabled={pending}
                            onClick={() => {
                              setDraft({
                                id: a.id,
                                category: a.category,
                                question: a.question,
                                answer: a.answer,
                              })
                              setError(null)
                            }}
                          >
                            {c.edit}
                          </button>
                          {confirmDelete === a.id ? (
                            <>
                              <button
                                type="button"
                                className={styles.dangerBtn}
                                disabled={pending}
                                onClick={() => remove(a.id)}
                              >
                                {c.confirmDelete}
                              </button>
                              <button
                                type="button"
                                className={styles.linkBtn}
                                disabled={pending}
                                onClick={() => setConfirmDelete(null)}
                              >
                                {c.cancel}
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className={styles.dangerBtn}
                              disabled={pending}
                              onClick={() => setConfirmDelete(a.id)}
                            >
                              {c.delete}
                            </button>
                          )}
                        </div>
                      ) : null}

                      {canManage && a.source === 'builtin' ? (
                        <p className={styles.meta}>{c.builtinNote}</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </>
  )
}
