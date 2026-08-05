import { redirect } from 'next/navigation'
import { Topbar } from '@/components/shell/Topbar'
import shell from '@/components/shell/shell.module.css'
import { can } from '@/lib/auth/permissions'
import { requireUser } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { periodParam, resolvePeriod } from '@/lib/queries/periods'
import { getReport } from '@/lib/queries/report'
import { ReportTable } from './report-table'

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireUser()
  if (!can(user, 'view:report')) redirect('/')

  const db = await getDb()
  const selection = await resolvePeriod(db, periodParam(await searchParams))
  if (!selection) return <main className={shell.content}>Dönem tanımlı değil.</main>

  const vm = await getReport(db, selection.current.code)

  return (
    <>
      <Topbar
        overline="Yönetici Raporu"
        title="Yönetici Raporu"
        periods={selection.all}
        activePeriod={selection.current.code}
      />
      <main className={shell.content}>
        <ReportTable vm={vm} />
      </main>
    </>
  )
}
