'use client'

import Link from 'next/link'
import { useState } from 'react'
import { KrTable } from '@/components/okr/KrTable'
import { Topbar } from '@/components/shell/Topbar'
import { Avatar } from '@/components/ui/Avatar'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatAsOf } from '@/lib/domain/format'
import { STATUS_VARS, statusOf } from '@/lib/domain/status'
import { tx } from '@/lib/i18n/strings'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import type { DeptDetailVm, ObjectiveDetailVm, ObjectiveVm } from '@/lib/queries/department'
import shell from '@/components/shell/shell.module.css'
import type { AssignablePerson } from '@/lib/queries/people'
import type { RangeSelection } from '@/lib/queries/range'
import { ObjectiveEditor } from './ObjectiveEditor'
import styles from '@/app/(app)/okr.module.css'

/**
 * The client half of the department and objective screens.
 *
 * Everything on these two screens reads `usePrefs()` — the TR/EN toggle has to
 * re-render the department name, the objective title and the topbar crumbs
 * alike — while the page files stay server components so they can reach the
 * database. So the whole visible body lives here and the pages only load data.
 */

/** "3 objective · 8 KR", the prototype's `deptModel.meta`. */
function countsLabel(objectives: ObjectiveVm[], lang: 'tr' | 'en'): string {
  const krCount = objectives.reduce((a, o) => a + o.krs.length, 0)
  const objWord = lang === 'tr' ? 'objective' : objectives.length === 1 ? 'objective' : 'objectives'
  return `${objectives.length} ${objWord} · ${krCount} KR`
}

export function ObjectiveCard({
  objective,
  asOfMonth,
}: {
  objective: ObjectiveVm
  asOfMonth: string
}) {
  const { t, lang } = usePrefs()
  // Expanded by default, as in the prototype: the key results are the point of
  // the screen, the toggle is there to get them out of the way.
  const [open, setOpen] = useState(true)

  const title = tx({ tr: objective.titleTr, en: objective.titleEn }, lang)
  const panelId = `krs-${objective.id}`

  return (
    <section className={styles.card}>
      <div className={styles.cardHead}>
        <div className={styles.cardMain}>
          <span className={styles.overline}>
            {t('objective')} · {objective.code}
          </span>
          <Link href={`/objective/${objective.id}`} className={styles.cardTitle}>
            {title}
          </Link>
          <div className={styles.ownerRow}>
            <Avatar name={objective.ownerName} />
            <span>
              {objective.ownerName} · {objective.krs.length} KR
            </span>
          </div>
        </div>

        <div className={styles.cardProgress}>
          <StatusBadge pct={objective.pct} />
          <ProgressBar pct={objective.pct} label={title} />
        </div>

        <button
          type="button"
          className={styles.toggle}
          aria-label={t('toggleKrs')}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
        >
          <span aria-hidden="true">{open ? '▴' : '▾'}</span>
        </button>
      </div>

      {open ? (
        <div className={styles.krPanel} id={panelId}>
          <KrTable krs={objective.krs} caption={`${title} — ${t('keyResults')}`} asOfMonth={asOfMonth} />
        </div>
      ) : null}
    </section>
  )
}

export function DepartmentScreen({
  dept,
  selection,
  asOf,
  today,
}: {
  dept: DeptDetailVm
  selection: RangeSelection
  /** The cutoff the numbers were computed under — the range's end clamped to
   *  today (`asOfCutoff`), not `selection.range.to` raw. Deriving it here from
   *  `selection` again would let the markers measure against a future month
   *  the figures beside them never saw. */
  asOf: string
  /** Produced server-side via `todayInIstanbul(new Date())` — never `new
   *  Date()` here, which would risk a server/client hydration mismatch and
   *  break the Europe/Istanbul convention "today" follows everywhere else. */
  today: string
}) {
  const { t, lang } = usePrefs()
  const name = tx({ tr: dept.nameTr, en: dept.nameEn }, lang)
  const asOfMonth = asOf.slice(0, 7)

  return (
    <>
      <Topbar
        overline={t('departments')}
        title={`${dept.emoji} ${name}`}
        selection={selection}
      />

      <div className={shell.content}>
        <div className={styles.screen}>
          <Link href="/" className={styles.backLink}>
            ← {t('backOverview')}
          </Link>

          <div className={styles.deptHeader}>
            <div className={styles.deptHeaderMain}>
              <h2 className={styles.deptTitle}>
                <span className={styles.deptEmoji} aria-hidden="true">
                  {dept.emoji}
                </span>
                {name}
              </h2>
              <div className={styles.headerMeta}>
                <StatusBadge pct={dept.pct} />
                <span>
                  {countsLabel(dept.objectives, lang)}
                  {dept.leadName ? ` · ${t('owner')}: ${dept.leadName}` : ''}
                </span>
                {asOf < today ? <span>{formatAsOf(asOf, lang)}</span> : null}
              </div>
            </div>

            <div className={styles.summaryCard}>
              <span className={styles.summaryLabel}>{t('deptAvg')}</span>
              <ProgressBar pct={dept.pct} label={`${name} — ${t('deptAvg')}`} />
            </div>
          </div>

          {dept.objectives.length > 0 ? (
            <div className={styles.objectiveList}>
              {dept.objectives.map((o) => (
                <ObjectiveCard key={o.id} objective={o} asOfMonth={asOfMonth} />
              ))}
            </div>
          ) : (
            <div className={styles.empty}>
              <span className={styles.emptyIcon} aria-hidden="true">
                🗂️
              </span>
              <span className={styles.emptyText}>{t('emptyDept')}</span>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export function ObjectiveScreen({
  obj,
  selection,
  asOf,
  canEdit,
  people,
}: {
  obj: ObjectiveDetailVm
  selection: RangeSelection
  /** The cutoff the numbers were computed under — see `DepartmentScreen`. */
  asOf: string
  /** Server-decided; the actions re-check permission regardless. */
  canEdit: boolean
  people: AssignablePerson[]
}) {
  const { t, lang } = usePrefs()

  const title = tx({ tr: obj.titleTr, en: obj.titleEn }, lang)
  const deptName = tx({ tr: obj.deptNameTr, en: obj.deptNameEn }, lang)
  const statusColor = STATUS_VARS[statusOf(obj.pct)].fg
  const asOfMonth = asOf.slice(0, 7)

  return (
    <>
      <Topbar
        overline={t('objective')}
        title={title}
        selection={selection}
      />

      <div className={shell.content}>
        <div className={styles.screen}>
          <Link href={`/bolum/${obj.deptSlug}`} className={styles.backLink}>
            ← {obj.deptEmoji} {deptName}
          </Link>

          {canEdit ? <ObjectiveEditor obj={obj} people={people} /> : null}

          <div className={styles.objHeader}>
            <div className={styles.objHeaderMain}>
              <span className={styles.overline}>
                {t('objective')} · {obj.code}
              </span>
              <h2 className={styles.objTitle}>{title}</h2>
              <div className={styles.objOwner}>
                <Avatar name={obj.ownerName} />
                <span>{obj.ownerName}</span>
                <span className={styles.note}>
                  · {obj.periodCode} · {obj.krs.length} {t('keyResults')}
                </span>
              </div>
            </div>

            <div className={styles.progressCard}>
              <span className={styles.overline}>{t('objectiveProgress')}</span>
              <span className={styles.metric} style={{ color: statusColor }}>
                {obj.pct}%
              </span>
              <ProgressBar pct={obj.pct} showValue={false} label={t('objectiveProgress')} />
              <StatusBadge pct={obj.pct} />
              <span className={styles.note}>{t('simpleAvgNote')}</span>
            </div>
          </div>

          <section className={styles.tableCard}>
            <div className={styles.tableCardHead}>
              <h3 className={styles.tableCardTitle}>{t('keyResults')}</h3>
            </div>
            <KrTable krs={obj.krs} asOfMonth={asOfMonth} />
          </section>
        </div>
      </div>
    </>
  )
}
