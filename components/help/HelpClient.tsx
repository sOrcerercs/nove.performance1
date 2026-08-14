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
import { matchesQuery } from '@/lib/help/search'
import {
  CATEGORY_LABEL,
  HELP_CATEGORIES,
  type HelpArticle,
  type HelpCategory,
} from '@/lib/help/types'
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

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<HelpCategory | 'all'>('all')
  const [open, setOpen] = useState<Set<string>>(new Set())

  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim()
    return articles.filter((a) => {
      if (category !== 'all' && a.category !== category) return false
      if (!q) return true
      // The answer is searched too: people describe their problem, not the
      // heading it happens to live under.
      return matchesQuery(`${a.question} ${a.answer}`, q)
    })
  }, [articles, query, category])

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
      toast(draft.id ? 'Soru güncellendi' : 'Soru eklendi')
      setDraft(null)
      router.refresh()
    } else {
      setError(result.error)
    }
    setPending(false)
  }

  async function remove(id: string) {
    setPending(true)
    setError(null)
    const result = await deleteHelpArticle({ id })
    if (result.ok) {
      toast('Soru silindi')
      setConfirmDelete(null)
      router.refresh()
    } else {
      setError(result.error)
    }
    setPending(false)
  }

  const draftValid =
    draft !== null && draft.question.trim().length >= 5 && draft.answer.trim().length >= 10

  return (
    <>
      <h1 className={styles.h1}>Kullanım kılavuzu</h1>
      <p className={styles.lead}>
        Programın nasıl kullanıldığına dair sorular ve cevapları. Aradığınızı
        bulamazsanız bir yöneticiye söyleyin — buraya ekleyebilir.
      </p>

      <div className={styles.searchRow}>
        <input
          className={styles.search}
          placeholder="Soru veya kelime ara… (örn. parola, geçmiş veri, mali yıl)"
          aria-label="Kılavuzda ara"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className={styles.count}>
          {filtered.length} / {articles.length} soru
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
            + Soru ekle
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
          Tümü
        </button>
        {HELP_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            className={`${styles.chip} ${category === c ? styles.chipActive : ''}`}
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
          >
            {CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

      {draft ? (
        <div className={styles.editor}>
          <h2 className={styles.editorTitle}>
            {draft.id ? 'Soruyu düzenle' : 'Yeni soru ekle'}
          </h2>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="h-cat">Kategori</label>
            <select
              id="h-cat"
              className={styles.select}
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value as HelpCategory })}
            >
              {HELP_CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="h-q">Soru</label>
            <input
              id="h-q"
              className={styles.input}
              placeholder="Örn. Bir çalışan işten ayrılınca ne yapmalıyım?"
              value={draft.question}
              onChange={(e) => setDraft({ ...draft, question: e.target.value })}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="h-a">Cevap</label>
            <textarea
              id="h-a"
              className={styles.textarea}
              placeholder={'Adım adım anlatın.\n\nBoş satır yeni paragraf açar.'}
              value={draft.answer}
              onChange={(e) => setDraft({ ...draft, answer: e.target.value })}
            />
            <p className={styles.hint}>
              Biçimlendirme: <code>**kalın**</code> · <code>`kod`</code> · boş satır
              yeni paragraf. Başka bir şey desteklenmiyor.
            </p>
          </div>

          {draft.answer.trim() ? (
            <div className={styles.previewBox}>
              <div className={styles.previewLabel}>Önizleme</div>
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
              Vazgeç
            </button>
            <button
              type="button"
              className={styles.primary}
              disabled={!draftValid || pending}
              onClick={save}
            >
              {pending ? '…' : 'Kaydet'}
            </button>
          </div>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className={styles.card}>
          <p className={styles.empty}>
            “{query}” için sonuç yok. Farklı bir kelime deneyin ya da kategori
            filtresini kaldırın.
          </p>
        </div>
      ) : null}

      {HELP_CATEGORIES.filter((c) => grouped.has(c)).map((c) => (
        <section className={styles.section} key={c}>
          <h2 className={styles.sectionTitle}>{CATEGORY_LABEL[c]}</h2>
          <div className={styles.card}>
            {(grouped.get(c) ?? []).map((a) => {
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
                    <span className={styles.questionText}>{a.question}</span>
                    {a.source === 'custom' ? (
                      <span className={styles.customTag}>ekip notu</span>
                    ) : null}
                  </button>

                  {isOpen ? (
                    <div className={styles.answer}>
                      <RichText text={a.answer} />

                      {a.source === 'custom' && a.authorName ? (
                        <p className={styles.meta}>Ekleyen: {a.authorName}</p>
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
                            Düzenle
                          </button>
                          {confirmDelete === a.id ? (
                            <>
                              <button
                                type="button"
                                className={styles.dangerBtn}
                                disabled={pending}
                                onClick={() => remove(a.id)}
                              >
                                Evet, sil
                              </button>
                              <button
                                type="button"
                                className={styles.linkBtn}
                                disabled={pending}
                                onClick={() => setConfirmDelete(null)}
                              >
                                Vazgeç
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className={styles.dangerBtn}
                              disabled={pending}
                              onClick={() => setConfirmDelete(a.id)}
                            >
                              Sil
                            </button>
                          )}
                        </div>
                      ) : null}

                      {canManage && a.source === 'builtin' ? (
                        <p className={styles.meta}>
                          Yerleşik rehber — kodda tutulur, buradan düzenlenemez.
                        </p>
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
