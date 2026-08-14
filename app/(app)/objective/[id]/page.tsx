import { notFound } from 'next/navigation'
import { ObjectiveScreen } from '@/components/okr/ObjectiveCard'
import { can } from '@/lib/auth/permissions'
import { requireUser } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { asOfCutoff } from '@/lib/domain/dates'
import { getObjective } from '@/lib/queries/department'
import { getAssignablePeople } from '@/lib/queries/people'
import { resolveRange } from '@/lib/queries/range'

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
  const selection = await resolveRange(db, await searchParams)
  // Unlike the department screen, an objective has no "empty state" to fall
  // back to when the range matches zero periods: it belongs to exactly one
  // period, and rendering it would mean loading that period regardless of
  // what the filter says, which is a bigger behaviour change than this fix is
  // for. There is also no reachable path here the way there is for
  // departments — the sidebar has no objective links, only department ones,
  // and a zero-period department screen has no objective cards to click
  // through either. So a bookmarked or typed objective URL still 404s when
  // its range covers nothing; only a genuinely unknown id and this case are
  // indistinguishable, same as before this fix.
  // Never past today — see `asOfCutoff`.
  const asOf = asOfCutoff(selection.range.to, new Date())
  const obj = await getObjective(db, id, selection.periods.map((p) => p.id), asOf)
  if (!obj) notFound()

  const people = await getAssignablePeople(db)

  return (
    <ObjectiveScreen
      obj={obj}
      selection={selection}
      asOf={asOf}
      canEdit={can(user, 'edit:objective', { departmentId: obj.deptId })}
      people={people}
    />
  )
}
