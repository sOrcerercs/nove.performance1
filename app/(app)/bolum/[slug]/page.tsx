import { notFound } from 'next/navigation'
import { DepartmentScreen } from '@/components/okr/ObjectiveCard'
import { requireUser } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { getDepartment } from '@/lib/queries/department'
import { periodParam, resolvePeriod } from '@/lib/queries/periods'

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
  const selection = await resolvePeriod(db, periodParam(await searchParams))
  if (!selection) notFound()

  const dept = await getDepartment(db, slug, selection.current.code)
  if (!dept) notFound()

  return <DepartmentScreen dept={dept} periods={selection.all} activePeriod={selection.current.code} />
}
