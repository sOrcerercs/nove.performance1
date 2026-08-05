import { CheckinProvider } from '@/components/checkin/CheckinProvider'
import { Sidebar } from '@/components/shell/Sidebar'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { can } from '@/lib/auth/permissions'
import { requireUser } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { PrefsProvider } from '@/lib/prefs/PrefsProvider'
import { getCheckinCandidates } from '@/lib/queries/checkin'
import { resolvePeriod } from '@/lib/queries/periods'
import { getSidebarData } from '@/lib/queries/sidebar'
import styles from '@/components/shell/shell.module.css'

/**
 * Every authenticated screen renders inside this layout, and it is a server
 * component, so `requireUser()` runs on the server for each request. There is
 * no client-side route guard that could be skipped.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const db = await getDb()
  // Next does not pass searchParams to layouts. The sidebar therefore receives
  // every period's department progress and selects client-side from the URL,
  // so it can never disagree with the page content.
  const selection = await resolvePeriod(db, undefined)
  const defaultPeriod = selection?.current.code ?? ''
  const [sidebarData, checkinCandidates] = await Promise.all([
    getSidebarData(db),
    getCheckinCandidates(db, user, defaultPeriod),
  ])

  return (
    <PrefsProvider>
      <ToastProvider>
        <CheckinProvider candidates={checkinCandidates}>
          <div className={styles.app}>
            <Sidebar
              user={user}
              data={sidebarData}
              defaultPeriod={defaultPeriod}
              canCreate={can(user, 'create:objective', { departmentId: user.departmentId })}
              canManage={can(user, 'manage:users')}
            />
            <div className={styles.main}>{children}</div>
          </div>
        </CheckinProvider>
      </ToastProvider>
    </PrefsProvider>
  )
}
