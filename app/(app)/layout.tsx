import { headers } from 'next/headers'
import { CheckinProvider } from '@/components/checkin/CheckinProvider'
import { Sidebar } from '@/components/shell/Sidebar'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { can } from '@/lib/auth/permissions'
import { requireUser } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { asOfCutoff } from '@/lib/domain/dates'
import { PrefsProvider } from '@/lib/prefs/PrefsProvider'
import { getCheckinCandidates } from '@/lib/queries/checkin'
import { activePeriodOf, resolveRange, searchParamsFromHeader, type PeriodOption } from '@/lib/queries/range'
import { getSidebarData } from '@/lib/queries/sidebar'
import { allPeriods } from '@/lib/queries/tables'
import styles from '@/components/shell/shell.module.css'

/**
 * Every authenticated screen renders inside this layout, and it is a server
 * component, so `requireUser()` runs on the server for each request. There is
 * no client-side route guard that could be skipped.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const db = await getDb()

  // The middleware copies the query string into a header, so the sidebar
  // resolves the same range the page does and the two cannot disagree on one
  // URL. A missing header falls back to the default range.
  const searchParams = searchParamsFromHeader((await headers()).get('x-search-params'))
  const selection = await resolveRange(db, searchParams)

  const everyPeriod: PeriodOption[] = (await allPeriods(db)).map((p) => ({
    id: p.id,
    code: p.code,
    kind: p.kind,
    state: p.state,
    startsOn: p.startsOn,
    endsOn: p.endsOn,
  }))

  // Check-in is always about the period that is open now, whatever the filter
  // says — you cannot check in against a closed period.
  const openPeriod = activePeriodOf(everyPeriod)
  // The same clamp the pages apply (see `asOfCutoff`) — the sidebar's per
  // department percentages have to be computed under the identical cutoff, or
  // the menu and the department screen behind it disagree on one URL.
  const asOf = asOfCutoff(selection.range.to)
  const [sidebarData, checkinCandidates] = await Promise.all([
    getSidebarData(db, selection.periods.map((p) => p.id), asOf),
    getCheckinCandidates(db, user, openPeriod ? [openPeriod.id] : []),
  ])

  return (
    <PrefsProvider>
      <ToastProvider>
        <CheckinProvider candidates={checkinCandidates}>
          <div className={styles.app}>
            <Sidebar
              user={user}
              data={sidebarData}
              canCreate={can(user, 'create:objective', { departmentId: user.departmentId })}
              canManage={can(user, 'manage:users')}
              canEnterMonthly={can(user, 'checkin:kr')}
            />
            <div className={styles.main}>{children}</div>
          </div>
        </CheckinProvider>
      </ToastProvider>
    </PrefsProvider>
  )
}
