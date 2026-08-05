import { asc } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { Topbar } from '@/components/shell/Topbar'
import shell from '@/components/shell/shell.module.css'
import { can } from '@/lib/auth/permissions'
import { requireUser } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { departments } from '@/lib/db/schema'
import { getAssignablePeople } from '@/lib/queries/people'
import { periodParam, resolvePeriod } from '@/lib/queries/periods'
import { Wizard, type WizardDept } from './wizard'

export default async function NewObjectivePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireUser()
  const db = await getDb()

  const selection = await resolvePeriod(db, periodParam(await searchParams))
  if (!selection) return <main className={shell.content}>Dönem tanımlı değil.</main>

  const [rows, people] = await Promise.all([
    db.select().from(departments).orderBy(asc(departments.sortOrder)),
    getAssignablePeople(db),
  ])

  // The server action re-checks regardless; this only shapes the form.
  const allowed: WizardDept[] = rows
    .filter((d) => can(user, 'create:objective', { departmentId: d.id }))
    .map((d) => ({ id: d.id, emoji: d.emoji, nameTr: d.nameTr, nameEn: d.nameEn }))

  if (allowed.length === 0) redirect('/')

  return (
    <>
      <Topbar
        overline="Yeni Objective"
        title="Yeni Objective"
        periods={selection.all}
        activePeriod={selection.current.code}
      />
      <main className={shell.content}>
        <Wizard
          depts={allowed}
          defaultDeptId={allowed[0]?.id ?? ''}
          periodCode={selection.current.code}
          people={people}
        />
      </main>
    </>
  )
}
