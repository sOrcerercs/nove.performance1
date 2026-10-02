import { Topbar } from '@/components/shell/Topbar'
import shell from '@/components/shell/shell.module.css'
import { requireUser } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { getT } from '@/lib/i18n/server'
import { getMonthlyEntryVm } from '@/lib/queries/monthly'
import { resolveRange } from '@/lib/queries/range'
import { EntryTable } from './entry-table'

export default async function VeriGirisiPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireUser()
  const db = await getDb()
  const t = await getT()
  const sp = await searchParams
  const monthParam = typeof sp?.ay === 'string' ? sp.ay : undefined

  const [selection, vm] = await Promise.all([
    resolveRange(db, sp),
    getMonthlyEntryVm(db, user, monthParam),
  ])

  return (
    <>
      <Topbar overline={t('navMonthlyEntry')} title={t('monthlyEntryTitle')} selection={selection} />
      <main className={shell.content}>
        <EntryTable vm={vm} />
      </main>
    </>
  )
}
