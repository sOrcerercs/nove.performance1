'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useToast } from '@/components/ui/ToastProvider'
import {
  createDepartment,
  deleteDepartment,
  departmentDeletionImpact,
  moveDepartment,
  updateDepartment,
} from '@/lib/actions/departments'
import { formatCount } from '@/lib/domain/format'
import type { Bilingual } from '@/lib/domain/types'
import { fill, tx } from '@/lib/i18n/strings'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import type { AdminDepartment } from '@/lib/queries/admin'
import type { AssignablePerson } from '@/lib/queries/people'
import styles from './admin.module.css'

interface Impact {
  nameTr: string
  objectives: number
  keyResults: number
  checkins: number
  users: number
}

interface Draft {
  emoji: string
  nameTr: string
  nameEn: string
  leadUserId: string
}

export function DepartmentsTable({
  rows,
  people,
}: {
  rows: AdminDepartment[]
  people: AssignablePerson[]
}) {
  const { t, lang } = usePrefs()
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  const [error, setError] = useState<string | null>(null)

  // New department
  const [slug, setSlug] = useState('')
  const [emoji, setEmoji] = useState('')
  const [nameTr, setNameTr] = useState('')
  const [nameEn, setNameEn] = useState('')

  // Inline edit — which row, and its draft
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>({ emoji: '', nameTr: '', nameEn: '', leadUserId: '' })

  // Delete confirmation
  const [impact, setImpact] = useState<{ id: string; data: Impact } | null>(null)

  const refresh = () => startTransition(() => router.refresh())

  async function run(
    fn: () => Promise<{ ok: boolean; error?: Bilingual }>,
    okMsg: string,
  ): Promise<boolean> {
    setError(null)
    const result = await fn()
    if (result.ok) {
      toast(okMsg)
      refresh()
      return true
    }
    setError(result.error ? tx(result.error, lang) : t('actionFailed'))
    return false
  }

  async function onCreate() {
    const ok = await run(
      () => createDepartment({ slug, emoji, nameTr, nameEn, leadUserId: null }),
      t('toastDeptAdded'),
    )
    if (ok) { setSlug(''); setEmoji(''); setNameTr(''); setNameEn('') }
  }

  function startEdit(d: AdminDepartment) {
    setEditing(d.id)
    setError(null)
    setDraft({
      emoji: d.emoji,
      nameTr: d.nameTr,
      nameEn: d.nameEn,
      leadUserId: d.leadUserId ?? '',
    })
  }

  async function saveEdit(id: string) {
    const ok = await run(
      () => updateDepartment({
        id,
        emoji: draft.emoji,
        nameTr: draft.nameTr,
        nameEn: draft.nameEn,
        leadUserId: draft.leadUserId || null,
      }),
      t('toastDeptUpdated'),
    )
    if (ok) setEditing(null)
  }

  async function askDelete(id: string) {
    setError(null)
    const result = await departmentDeletionImpact(id)
    if (result.ok) setImpact({ id, data: result.data })
    else setError(tx(result.error, lang))
  }

  async function confirmDelete(id: string) {
    const ok = await run(() => deleteDepartment({ id }), t('toastDeptDeleted'))
    if (ok) setImpact(null)
  }

  return (
    <section className={styles.card}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>{t('navGroupDepts')}</h2>
        <span>{rows.length}</span>
      </div>

      <div className={styles.inviteBar}>
        <input
          className={styles.input} style={{ maxWidth: 70 }}
          placeholder="🏢" aria-label="Emoji"
          value={emoji} onChange={(e) => setEmoji(e.target.value)}
        />
        <input
          className={`${styles.input} ${styles.inputName}`}
          placeholder={t('deptNameTr')} aria-label={t('deptNameTr')}
          value={nameTr} onChange={(e) => setNameTr(e.target.value)}
        />
        <input
          className={`${styles.input} ${styles.inputName}`}
          placeholder="Department name (EN)" aria-label={t('deptNameEn')}
          value={nameEn} onChange={(e) => setNameEn(e.target.value)}
        />
        <input
          className={styles.input} style={{ maxWidth: 150 }}
          placeholder={t('slugPh')} aria-label={t('slugAria')}
          value={slug} onChange={(e) => setSlug(e.target.value)}
        />
        <button
          type="button" className={styles.primary}
          disabled={pending || !emoji || !nameTr.trim() || !nameEn.trim() || !slug.trim()}
          onClick={onCreate}
        >
          {t('add')}
        </button>
      </div>

      <p className={styles.hintRow}>
        {t('slugNoteA')}<code>/bolum/{t('slugPh')}</code>{t('slugNoteB')}
      </p>

      {error ? <p className={styles.error} role="alert">{error}</p> : null}

      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col" className={styles.th}>{t('thDept')}</th>
            <th scope="col" className={styles.th}>{t('thSlug')}</th>
            <th scope="col" className={styles.th}>{t('owner')}</th>
            <th scope="col" className={`${styles.th} ${styles.thNum}`}>{t('thObjectives')}</th>
            <th scope="col" className={`${styles.th} ${styles.thNum}`}>{t('thPeople')}</th>
            <th scope="col" className={styles.th}>{t('thOrder')}</th>
            <th scope="col" className={styles.th}>{t('thAction')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d, i) => (
            <tr className={styles.row} key={d.id}>
              {editing === d.id ? (
                <>
                  <td className={styles.td}>
                    <div className={styles.editRow}>
                      <input
                        className={styles.input} style={{ maxWidth: 60 }}
                        aria-label="Emoji" value={draft.emoji}
                        onChange={(e) => setDraft({ ...draft, emoji: e.target.value })}
                      />
                      <input
                        className={styles.input} aria-label={t('nameTr')} value={draft.nameTr}
                        onChange={(e) => setDraft({ ...draft, nameTr: e.target.value })}
                      />
                      <input
                        className={styles.input} aria-label={t('nameEn')} value={draft.nameEn}
                        onChange={(e) => setDraft({ ...draft, nameEn: e.target.value })}
                      />
                    </div>
                  </td>
                  <td className={styles.td}>{d.slug}</td>
                  <td className={styles.td}>
                    <select
                      className={styles.select} aria-label={t('owner')}
                      value={draft.leadUserId}
                      onChange={(e) => setDraft({ ...draft, leadUserId: e.target.value })}
                    >
                      <option value="">—</option>
                      {people.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className={`${styles.td} ${styles.tdNum}`}>{d.objectiveCount}</td>
                  <td className={`${styles.td} ${styles.tdNum}`}>{d.userCount}</td>
                  <td className={styles.td}>—</td>
                  <td className={styles.td}>
                    <div className={styles.actions}>
                      <button
                        type="button" className={styles.linkBtn} disabled={pending}
                        onClick={() => saveEdit(d.id)}
                      >
                        {t('saveBtn')}
                      </button>
                      <button
                        type="button" className={styles.linkBtn} disabled={pending}
                        onClick={() => setEditing(null)}
                      >
                        {t('cancel')}
                      </button>
                    </div>
                  </td>
                </>
              ) : (
                <>
                  <td className={styles.td}>
                    <span aria-hidden="true">{d.emoji}</span> {d.nameTr}
                    <div className={styles.userEmail}>{d.nameEn}</div>
                  </td>
                  <td className={styles.td}><code>{d.slug}</code></td>
                  <td className={styles.td}>{d.leadName || '—'}</td>
                  <td className={`${styles.td} ${styles.tdNum}`}>{d.objectiveCount}</td>
                  <td className={`${styles.td} ${styles.tdNum}`}>{d.userCount}</td>
                  <td className={styles.td}>
                    <div className={styles.actions}>
                      <button
                        type="button" className={styles.linkBtn}
                        aria-label={`${tx({ tr: d.nameTr, en: d.nameEn }, lang)} ${t('moveUp')}`} disabled={pending || i === 0}
                        onClick={() => run(() => moveDepartment({ id: d.id, direction: 'up' }), t('toastOrderChanged'))}
                      >
                        ↑
                      </button>
                      <button
                        type="button" className={styles.linkBtn}
                        aria-label={`${tx({ tr: d.nameTr, en: d.nameEn }, lang)} ${t('moveDown')}`} disabled={pending || i === rows.length - 1}
                        onClick={() => run(() => moveDepartment({ id: d.id, direction: 'down' }), t('toastOrderChanged'))}
                      >
                        ↓
                      </button>
                    </div>
                  </td>
                  <td className={styles.td}>
                    <div className={styles.actions}>
                      <button
                        type="button" className={styles.linkBtn} disabled={pending}
                        onClick={() => startEdit(d)}
                      >
                        {t('edit')}
                      </button>
                      <button
                        type="button" className={styles.dangerBtn} disabled={pending}
                        onClick={() => askDelete(d.id)}
                      >
                        {t('delete')}
                      </button>
                    </div>

                    {impact?.id === d.id ? (
                      <div className={styles.confirmBox} role="alertdialog">
                        {impact.data.objectives > 0 ? (
                          <p className={styles.confirmText}>
                            <strong>{t('cannotDelete')}</strong>{' '}
                            {fill(t('deptDeleteBlocked'), {
                              objectives: formatCount(impact.data.objectives, 'objective', lang),
                              krs: formatCount(impact.data.keyResults, 'key result', lang),
                              checkins: formatCount(impact.data.checkins, 'check-in', lang),
                            })}
                          </p>
                        ) : (
                          <p className={styles.confirmText}>
                            <strong>{impact.data.nameTr}</strong> {t('willBeDeleted')}
                            {impact.data.users > 0
                              ? ` ${fill(t('deptDeleteUsers'), { n: impact.data.users })}`
                              : ` ${t('deptDeleteNoLinks')}`}
                          </p>
                        )}
                        <div className={styles.confirmActions}>
                          <button
                            type="button" className={styles.linkBtn}
                            onClick={() => setImpact(null)} disabled={pending}
                          >
                            {t('cancel')}
                          </button>
                          {impact.data.objectives === 0 ? (
                            <button
                              type="button" className={styles.dangerBtn}
                              onClick={() => confirmDelete(d.id)} disabled={pending}
                            >
                              {t('confirmDelete')}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
