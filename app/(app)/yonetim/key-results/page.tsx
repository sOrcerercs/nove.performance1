import { redirect } from 'next/navigation'
import { Topbar } from '@/components/shell/Topbar'
import shell from '@/components/shell/shell.module.css'
import { can } from '@/lib/auth/permissions'
import { requireUser } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { getT } from '@/lib/i18n/server'
import { getKrTableVm } from '@/lib/queries/kr-table'
import { resolveRange } from '@/lib/queries/range'
import { KrTableScreen } from './kr-table-screen'

/**
 * Key Results under Yönetim: every key result's month-by-month table.
 * Oversight, so Yönetici and Üst Yönetim (`view:report`); read-only — the
 * "Düzelt" link to Veri Girişi only shows to those who may enter values.
 */
export default async function KeyResultsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireUser()
  if (!can(user, 'view:report')) redirect('/')

  const db = await getDb()
  const t = await getT()
  const sp = await searchParams
  const selection = await resolveRange(db, sp)
  const vm = await getKrTableVm(
    db,
    selection.periods.map((p) => p.id),
    typeof sp?.kr === 'string' ? sp.kr : undefined,
  )

  return (
    <>
      <Topbar overline={t('admin')} title={t('navKeyResults')} selection={selection} />
      <main className={shell.content}>
        <KrTableScreen vm={vm} canEnter={can(user, 'checkin:kr')} />
      </main>
    </>
  )
}
