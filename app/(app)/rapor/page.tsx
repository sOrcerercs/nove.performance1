import { redirect } from 'next/navigation'
import { Topbar } from '@/components/shell/Topbar'
import shell from '@/components/shell/shell.module.css'
import { can } from '@/lib/auth/permissions'
import { requireUser } from '@/lib/auth/session'
import { asOfCutoff, todayInIstanbul } from '@/lib/domain/dates'
import { getDb } from '@/lib/db'
import { getT } from '@/lib/i18n/server'
import { resolveRange } from '@/lib/queries/range'
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
  const t = await getT()
  const selection = await resolveRange(db, await searchParams)
  const now = new Date()
  // Never past today — see `asOfCutoff`.
  const asOf = asOfCutoff(selection.range.to, now)
  const vm = await getReport(db, selection.periods.map((p) => p.id), asOf)

  return (
    <>
      <Topbar overline={t('reportTitle')} title={t('reportTitle')} selection={selection} />
      <main className={shell.content}>
        <ReportTable vm={vm} asOf={asOf} today={todayInIstanbul(now)} />
      </main>
    </>
  )
}
