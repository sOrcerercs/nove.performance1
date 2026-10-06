'use client'

import { useRouter } from 'next/navigation'
import { Fragment, useState, useTransition } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { useToast } from '@/components/ui/ToastProvider'
import {
  createPeriod,
  createUser,
  deleteUser,
  setDefaultRangeStart,
  setPeriodState,
  updatePeriodDates,
  setUserRole,
  setUserState,
  updateUserFields,
} from '@/lib/actions/admin'
import { managerCandidates } from '@/lib/auth/hierarchy'
import { canSignIn, type Role } from '@/lib/domain/types'
import type { Bilingual } from '@/lib/domain/types'
import { ROLE_KEY, tx } from '@/lib/i18n/strings'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import type { AdminVm } from '@/lib/queries/admin'
import type { AssignablePerson } from '@/lib/queries/people'
import { DepartmentsTable } from './departments-table'
import { UserAccountEditor } from './user-account-editor'
import styles from './admin.module.css'

/** İK/Yönetim only — there are no department-lead or team-member accounts. */
const ROLES: Role[] = ['admin', 'executive', 'staff']

/** Columns in the users table header — the Düzenle row spans all of them. */
const USER_COLUMNS = 8

const STATE_CLASS: Record<string, string | undefined> = {
  active: styles.stateActive,
  passive: styles.statePassive,
  closed: styles.stateClosed,
  planned: styles.statePlanned,
}

export function AdminTables({
  vm,
  currentUserId,
  people,
}: {
  vm: AdminVm
  currentUserId: string
  people: AssignablePerson[]
}) {
  const { t, lang } = usePrefs()
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  const [error, setError] = useState<string | null>(null)

  // New user form
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('staff')
  const [deptId, setDeptId] = useState<string>('')
  const [password, setPassword] = useState('')

  // New period form. Always creates a fiscal year (`kind: 'year'` below) —
  // a quarter or month period can still exist, but only added by hand
  // straight into the database; this form has no control for `kind`.
  const [pCode, setPCode] = useState('')
  const [pStart, setPStart] = useState('')
  const [pEnd, setPEnd] = useState('')

  // Period date edit — which row is open, and its draft
  const [dateFor, setDateFor] = useState<string | null>(null)
  const [dStart, setDStart] = useState('')
  const [dEnd, setDEnd] = useState('')

  // Default date range start
  const [rangeStart, setRangeStart] = useState(vm.defaultRangeStart)

  type UserFilter = 'all' | 'noDept' | 'noManager'
  const [userFilter, setUserFilter] = useState<UserFilter>('all')
  const [deptFilter, setDeptFilter] = useState('')
  // Düzenle — which row's panel is open
  const [editFor, setEditFor] = useState<string | null>(null)
  // A generated password is on screen: keep the panel from being unmounted before it is copied
  const [showingPassword, setShowingPassword] = useState(false)
  const activeUsers = vm.users.filter((u) => u.state === 'active')
  const missingDept = activeUsers.filter((u) => u.departmentId === null).length
  const missingManager = activeUsers.filter((u) => u.managerId === null).length
  const visibleUsers = vm.users.filter((u) =>
    (userFilter === 'all' ||
      (u.state === 'active' && (userFilter === 'noDept' ? u.departmentId === null : u.managerId === null))) &&
    (deptFilter === '' || u.departmentId === deptFilter),
  )
  const candidatesFor = (userId: string) => managerCandidates(userId, vm.users)

  const refresh = () => startTransition(() => router.refresh())

  const stateLabel = (s: string) =>
    s === 'active' ? t('stateActive')
    : s === 'passive' ? t('statePassive')
    : s === 'closed' ? t('stateClosed')
    : t('statePlanned')

  async function run<T>(fn: () => Promise<{ ok: boolean; error?: Bilingual } & T>, okMsg: string) {
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

  async function onCreateUser() {
    const ok = await run(
      () => createUser({
        name,
        email: email.trim() || null,
        role,
        departmentId: deptId || null,
        ...(canSignIn(role) ? { password } : {}),
      }),
      t('toastUserAdded'),
    )
    if (ok) { setName(''); setEmail(''); setPassword('') }
  }

  async function onCreatePeriod() {
    const ok = await run(
      () => createPeriod({ code: pCode, kind: 'year', startsOn: pStart, endsOn: pEnd }),
      t('toastPeriodAdded'),
    )
    if (ok) { setPCode(''); setPStart(''); setPEnd('') }
  }

  async function onSaveRangeStart() {
    await run(
      () => setDefaultRangeStart({ startsOn: rangeStart }),
      t('toastRangeStartUpdated'),
    )
  }

  return (
    <>
      <h1 className={styles.h1}>{t('adminTitle')}</h1>
      <p className={styles.lead}>{t('adminLead')}</p>

      {error ? <p className={styles.errorTop} role="alert">{error}</p> : null}

      {/* ------------------------------ users ------------------------------ */}
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>{t('users')}</h2>
          <span>{vm.users.length}</span>
        </div>

        <div className={styles.inviteBar}>
          <input
            className={`${styles.input} ${styles.inputName}`}
            placeholder={t('fullName')} aria-label={t('fullName')}
            value={name} onChange={(e) => setName(e.target.value)}
          />
          <input
            className={`${styles.input} ${styles.inputEmail}`}
            type="email" placeholder={canSignIn(role) ? 'ad.soyad@nove.group' : t('emailOptionalPh')} aria-label={t('email')}
            value={email} onChange={(e) => setEmail(e.target.value)}
          />
          <select
            className={styles.select} aria-label={t('thRole')}
            value={role} onChange={(e) => setRole(e.target.value as Role)}
          >
            {ROLES.map((r) => <option key={r} value={r}>{t(ROLE_KEY[r])}</option>)}
          </select>
          <select
            className={styles.select} aria-label={t('thDept')}
            value={deptId} onChange={(e) => setDeptId(e.target.value)}
          >
            <option value="">{t('deptNone')}</option>
            {vm.departments.map((d) => (
              <option key={d.id} value={d.id}>{tx({ tr: d.nameTr, en: d.nameEn }, lang)}</option>
            ))}
          </select>
          {/* Staff hold no credential, so no password field for them. */}
          {canSignIn(role) ? (
            <input
              className={styles.input} type="password" autoComplete="new-password"
              placeholder={t('passwordMinPh')} aria-label={t('password')}
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
          ) : null}
          <button
            type="button" className={styles.primary}
            disabled={pending || name.trim() === '' || (canSignIn(role) && email.trim() === '')}
            onClick={onCreateUser}
          >
            {t('add')}
          </button>
        </div>

        <div className={styles.inviteBar} role="group" aria-label={t('filterEveryone')}>
          <select className={styles.select} aria-label={t('filterEveryone')} value={userFilter}
            onChange={(e) => setUserFilter(e.target.value as UserFilter)}>
            <option value="all">{t('filterEveryone')} ({vm.users.length})</option>
            <option value="noDept">{t('filterNoDept')} ({missingDept})</option>
            <option value="noManager">{t('filterNoManager')} ({missingManager})</option>
          </select>
          <select className={styles.select} aria-label={t('filterAllDepts')} value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}>
            <option value="">{t('filterAllDepts')}</option>
            {vm.departments.map((d) => (
              <option key={d.id} value={d.id}>{tx({ tr: d.nameTr, en: d.nameEn }, lang)}</option>
            ))}
          </select>
        </div>

        <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col" className={styles.th}>{t('thUser')}</th>
              <th scope="col" className={styles.th}>{t('thTitle')}</th>
              <th scope="col" className={styles.th}>{t('thRole')}</th>
              <th scope="col" className={styles.th}>{t('thDept')}</th>
              <th scope="col" className={styles.th}>{t('thManager')}</th>
              <th scope="col" className={`${styles.th} ${styles.thNum}`}>{t('thKrOwned')}</th>
              <th scope="col" className={styles.th}>{t('thStatus')}</th>
              <th scope="col" className={styles.th}>{t('thAction')}</th>
            </tr>
          </thead>
          <tbody>
            {visibleUsers.map((u) => {
              const isSelf = u.id === currentUserId
              return (
                <Fragment key={u.id}>
                <tr className={styles.row}>
                  <td className={styles.td}>
                    <span className={styles.userCell}>
                      <Avatar name={u.name} />
                      <span>
                        <div className={styles.userName}>
                          {u.name}{isSelf ? ` (${t('youTag')})` : ''}
                        </div>
                        <div className={styles.userEmail}>{u.email ?? t('emailNone')}</div>
                      </span>
                    </span>
                  </td>

                  <td className={styles.td}>
                    <input
                      key={u.title ?? ''}
                      className={`${styles.input} ${styles.cellField}`} defaultValue={u.title ?? ''} placeholder={t('titlePh')}
                      aria-label={`${u.name} ${t('thTitle')}`} disabled={pending}
                      onBlur={(e) => {
                        const next = e.target.value.trim()
                        if (next !== (u.title ?? '')) {
                          void run(() => updateUserFields({ userId: u.id, title: next || null }), t('toastTitleUpdated'))
                        }
                      }}
                    />
                  </td>

                  <td className={styles.td}>
                    <select
                      className={styles.select} value={u.role}
                      aria-label={`${u.name} ${t('thRole')}`}
                      // Changing your own role could lock you out of this screen.
                      disabled={pending || isSelf}
                      onChange={(e) =>
                        run(() => setUserRole({ userId: u.id, role: e.target.value as Role }),
                            t('toastRoleUpdated'))
                      }
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{t(ROLE_KEY[r])}</option>)}
                    </select>
                  </td>

                  <td className={styles.td}>
                    <select
                      className={`${styles.select} ${styles.cellField}`} value={u.departmentId ?? ''} disabled={pending}
                      aria-label={`${u.name} ${t('thDept')}`}
                      onChange={(e) =>
                        run(() => updateUserFields({ userId: u.id, departmentId: e.target.value || null }),
                            t('toastDeptUpdatedUser'))
                      }
                    >
                      <option value="">{t('deptNone')}</option>
                      {vm.departments.map((d) => (
                        <option key={d.id} value={d.id}>{tx({ tr: d.nameTr, en: d.nameEn }, lang)}</option>
                      ))}
                    </select>
                  </td>

                  <td className={styles.td}>
                    <select
                      className={`${styles.select} ${styles.cellField}`} value={u.managerId ?? ''} disabled={pending}
                      aria-label={`${u.name} ${t('thManager')}`}
                      onChange={(e) =>
                        run(() => updateUserFields({ userId: u.id, managerId: e.target.value || null }),
                            t('toastManagerUpdated'))
                      }
                    >
                      <option value="">{t('managerNone')}</option>
                      {/* A current manager who has since gone passive still shows, so the cell is never blank. */}
                      {u.managerId && !candidatesFor(u.id).some((m) => m.id === u.managerId) ? (
                        <option value={u.managerId}>{u.managerName}</option>
                      ) : null}
                      {candidatesFor(u.id).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </td>

                  <td className={`${styles.td} ${styles.tdNum}`}>{u.krsOwned}</td>

                  <td className={styles.td}>
                    <span className={`${styles.pill} ${STATE_CLASS[u.state] ?? ''}`}>
                      <span className={styles.dot} aria-hidden="true" />
                      {stateLabel(u.state)}
                    </span>
                    {u.mustChangePassword ? (
                      <span className={`${styles.pill} ${styles.statePlanned}`}>{t('passwordPending')}</span>
                    ) : null}
                  </td>

                  <td className={styles.td}>
                    <div className={styles.actions}>
                      <button
                        type="button" className={styles.linkBtn} disabled={pending || showingPassword}
                        onClick={() => setEditFor(editFor === u.id ? null : u.id)}
                      >
                        {t('edit')}
                      </button>
                      {!isSelf ? (
                        <button
                          type="button" className={styles.linkBtn} disabled={pending}
                          onClick={() =>
                            run(() => setUserState({
                              userId: u.id,
                              state: u.state === 'passive' ? 'active' : 'passive',
                            }), u.state === 'passive' ? t('toastActivated') : t('toastDeactivated'))
                          }
                        >
                          {u.state === 'passive' ? t('activate') : t('deactivate')}
                        </button>
                      ) : null}

                      {!isSelf ? (
                        <button
                          type="button" className={styles.dangerBtn} disabled={pending}
                          onClick={() => run(() => deleteUser({ userId: u.id }), t('toastUserDeleted'))}
                        >
                          {t('delete')}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
                {/* Its own full-width row: inside the narrow action cell the
                    panel widened the whole table and pushed fields off-screen. */}
                {editFor === u.id ? (
                  <tr className={styles.editRow}>
                    <td className={styles.td} colSpan={USER_COLUMNS}>
                      <UserAccountEditor
                        user={u} isSelf={isSelf}
                        onIssuedChange={setShowingPassword}
                        onCancel={() => setEditFor(null)}
                        onDone={() => {
                          setEditFor(null)
                          toast(t('toastAccountUpdated'))
                          refresh()
                        }}
                      />
                    </td>
                  </tr>
                ) : null}
                </Fragment>
              )
            })}
          </tbody>
        </table>
        </div>
      </section>

      <DepartmentsTable rows={vm.departmentRows} people={people} />

      {/* ----------------------------- periods ----------------------------- */}
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>{t('periods')}</h2>
          <span>{vm.periods.length}</span>
        </div>

        <div className={styles.inviteBar}>
          <input
            className={styles.input}
            placeholder="2027-FY"
            aria-label={t('periodCode')}
            value={pCode} onChange={(e) => setPCode(e.target.value)}
          />
          <input
            className={styles.input} type="date" aria-label={t('thStart')}
            value={pStart} onChange={(e) => setPStart(e.target.value)}
          />
          <input
            className={styles.input} type="date" aria-label={t('thEnd')}
            value={pEnd} onChange={(e) => setPEnd(e.target.value)}
          />
          <button
            type="button" className={styles.primary}
            disabled={pending || !pCode || !pStart || !pEnd}
            onClick={onCreatePeriod}
          >
            {t('add')}
          </button>
        </div>

        <p className={styles.hintRow}>
          {t('fyNoteA')}<strong>{t('fyNoteMonth')}</strong>{t('fyNoteB')}{' '}
          <code>2026-FY</code> {t('fyNoteRange')}{' '}
          {t('fyNoteActiveA')} <strong>{t('stateActive').toLowerCase()}</strong>{' '}
          {t('fyNoteActiveB')}
        </p>

        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col" className={styles.th}>{t('period')}</th>
              <th scope="col" className={styles.th}>{t('thStatus')}</th>
              <th scope="col" className={styles.th}>{t('thStart')}</th>
              <th scope="col" className={styles.th}>{t('thEnd')}</th>
            </tr>
          </thead>
          <tbody>
            {vm.periods.map((p) => (
              <tr className={styles.row} key={p.id}>
                <td className={styles.td}>{p.code}</td>
                <td className={styles.td}>
                  <select
                    className={styles.select}
                    value={p.state}
                    aria-label={`${p.code} ${t('thStatus')}`}
                    disabled={pending}
                    onChange={(e) =>
                      run(
                        () => setPeriodState({
                          periodId: p.id,
                          state: e.target.value as 'active' | 'closed' | 'planned',
                        }),
                        t('toastPeriodStateUpdated'),
                      )
                    }
                  >
                    <option value="active">{t('stateActive')}</option>
                    <option value="planned">{t('statePlanned')}</option>
                    <option value="closed">{t('stateClosed')}</option>
                  </select>
                </td>
                {dateFor === p.id ? (
                  <>
                    <td className={styles.td}>
                      <input
                        className={styles.input} type="date" aria-label={t('thStart')}
                        value={dStart} onChange={(e) => setDStart(e.target.value)}
                      />
                    </td>
                    <td className={styles.td}>
                      <div className={styles.editRow}>
                        <input
                          className={styles.input} type="date" aria-label={t('thEnd')}
                          value={dEnd} onChange={(e) => setDEnd(e.target.value)}
                        />
                        <button
                          type="button" className={styles.linkBtn} disabled={pending}
                          onClick={async () => {
                            const done = await run(
                              () => updatePeriodDates({ periodId: p.id, startsOn: dStart, endsOn: dEnd }),
                              t('toastPeriodDatesUpdated'),
                            )
                            if (done) setDateFor(null)
                          }}
                        >
                          {t('saveBtn')}
                        </button>
                        <button
                          type="button" className={styles.linkBtn}
                          onClick={() => setDateFor(null)} disabled={pending}
                        >
                          {t('cancel')}
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className={styles.td}>{p.startsOn}</td>
                    <td className={styles.td}>
                      <div className={styles.editRow}>
                        <span>{p.endsOn}</span>
                        <button
                          type="button" className={styles.linkBtn} disabled={pending}
                          onClick={() => {
                            setDateFor(p.id)
                            setDStart(p.startsOn)
                            setDEnd(p.endsOn)
                          }}
                        >
                          {t('editDates')}
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ---------------------- default range start ---------------------- */}
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>{t('defaultRangeStart')}</h2>
        </div>

        <div className={styles.inviteBar}>
          <input
            className={styles.input} type="date"
            aria-label={t('defaultRangeStart')}
            value={rangeStart} onChange={(e) => setRangeStart(e.target.value)}
          />
          <button
            type="button" className={styles.primary}
            disabled={pending || !rangeStart}
            onClick={onSaveRangeStart}
          >
            {t('saveBtn')}
          </button>
        </div>

        <p className={styles.hintRow}>{t('defaultRangeStartNote')}</p>
      </section>
    </>
  )
}
