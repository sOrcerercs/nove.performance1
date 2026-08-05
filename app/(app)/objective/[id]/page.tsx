import { notFound } from 'next/navigation'
import { ObjectiveScreen } from '@/components/okr/ObjectiveCard'
import { can } from '@/lib/auth/permissions'
import { requireUser } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { getObjective } from '@/lib/queries/department'
import { getAssignablePeople } from '@/lib/queries/people'
import { periodParam, resolvePeriod } from '@/lib/queries/periods'

export default async function ObjectivePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireUser()
  const { id } = await params

  const db = await getDb()
  const selection = await resolvePeriod(db, periodParam(await searchParams))
  if (!selection) notFound()

  const obj = await getObjective(db, id, selection.current.code)
  if (!obj) notFound()

  const people = await getAssignablePeople(db)

  return (
    <ObjectiveScreen
      obj={obj}
      periods={selection.all}
      activePeriod={selection.current.code}
      canEdit={can(user, 'edit:objective', { departmentId: obj.deptId })}
      people={people}
    />
  )
}
