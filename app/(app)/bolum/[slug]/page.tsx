import { notFound } from 'next/navigation'
import { DepartmentScreen } from '@/components/okr/ObjectiveCard'
import { requireUser } from '@/lib/auth/session'
import { asOfCutoff, todayInIstanbul } from '@/lib/domain/dates'
import { getDb } from '@/lib/db'
import { getDepartmentForPage } from '@/lib/queries/department'
import { resolveRange } from '@/lib/queries/range'

export default async function DepartmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireUser()
  const { slug } = await params

  const db = await getDb()
  const selection = await resolveRange(db, await searchParams)
  const now = new Date()
  // Never past today — see `asOfCutoff`.
  const asOf = asOfCutoff(selection.range.to, now)
  // A range matching zero periods (e.g. the "previous fiscal year" preset on a
  // database with no data that far back) must still render a department the
  // sidebar is listing — only a genuinely unknown slug gets notFound().
  const result = await getDepartmentForPage(db, slug, selection.periods.map((p) => p.id), asOf)
  if (result.kind === 'not-found') notFound()

  return (
    <DepartmentScreen
      dept={result.dept}
      selection={selection}
      asOf={asOf}
      today={todayInIstanbul(now)}
    />
  )
}
