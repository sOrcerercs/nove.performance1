import { OverviewClient } from '@/components/overview/OverviewClient'
import { Topbar } from '@/components/shell/Topbar'
import shell from '@/components/shell/shell.module.css'
import { requireUser } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { getOverview } from '@/lib/queries/overview'
import { periodParam, resolvePeriod } from '@/lib/queries/periods'

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireUser()
  const db = await getDb()
  const selection = await resolvePeriod(db, periodParam(await searchParams))
  if (!selection) return <main className={shell.content}>Dönem tanımlı değil.</main>

  const vm = await getOverview(db, selection.current.code)

  return (
    <>
      <Topbar
        overline="Performans Özeti"
        title="Performans Özeti"
        periods={selection.all}
        activePeriod={selection.current.code}
      />
      <main className={shell.content}>
        <OverviewClient vm={vm} />
      </main>
    </>
  )
}
