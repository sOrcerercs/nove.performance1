import { OverviewClient } from '@/components/overview/OverviewClient'
import { Topbar } from '@/components/shell/Topbar'
import shell from '@/components/shell/shell.module.css'
import { requireUser } from '@/lib/auth/session'
import { asOfCutoff, todayInIstanbul } from '@/lib/domain/dates'
import { getDb } from '@/lib/db'
import { getOverview } from '@/lib/queries/overview'
import { resolveRange } from '@/lib/queries/range'

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireUser()
  const db = await getDb()
  const selection = await resolveRange(db, await searchParams)
  const now = new Date()
  // Never past today: see `asOfCutoff`. The client gets the same clamped date,
  // so the "son veri" markers it draws are measured against the cutoff the
  // numbers beside them were actually computed under.
  const asOf = asOfCutoff(selection.range.to, now)
  const vm = await getOverview(db, selection.periods.map((p) => p.id), now, asOf)

  return (
    <>
      <Topbar overline="Performans Özeti" title="Performans Özeti" selection={selection} />
      <main className={shell.content}>
        <OverviewClient vm={vm} asOf={asOf} today={todayInIstanbul(now)} />
      </main>
    </>
  )
}
