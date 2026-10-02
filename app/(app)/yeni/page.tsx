import { asc } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { Topbar } from '@/components/shell/Topbar'
import shell from '@/components/shell/shell.module.css'
import { can } from '@/lib/auth/permissions'
import { requireUser } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { getT } from '@/lib/i18n/server'
import { departments } from '@/lib/db/schema'
import { getAssignablePeople } from '@/lib/queries/people'
import { activePeriodOf, resolveRange, type PeriodOption } from '@/lib/queries/range'
import { allPeriods } from '@/lib/queries/tables'
import { Wizard, type WizardDept } from './wizard'

export default async function NewObjectivePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireUser()
  const db = await getDb()
  const t = await getT()

  const selection = await resolveRange(db, await searchParams)
  // The open period is looked up among every period, independent of the
  // range filter — a new objective always belongs to the period that is
  // open right now, whatever the user has picked to view.
  const everyPeriod: PeriodOption[] = (await allPeriods(db)).map((p) => ({
    id: p.id,
    code: p.code,
    kind: p.kind,
    state: p.state,
    startsOn: p.startsOn,
    endsOn: p.endsOn,
  }))
  const openPeriod = activePeriodOf(everyPeriod)
  if (!openPeriod) {
    return (
      <main className={shell.content}>
        {t('noOpenPeriodAdmin')}
      </main>
    )
  }

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
      <Topbar overline={t('newObjective')} title={t('newObjective')} selection={selection} />
      <main className={shell.content}>
        <Wizard
          depts={allowed}
          defaultDeptId={allowed[0]?.id ?? ''}
          periodCode={openPeriod.code}
          people={people}
        />
      </main>
    </>
  )
}
