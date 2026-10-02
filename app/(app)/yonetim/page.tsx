import { redirect } from 'next/navigation'
import { Topbar } from '@/components/shell/Topbar'
import shell from '@/components/shell/shell.module.css'
import { can } from '@/lib/auth/permissions'
import { requireUser } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { getT } from '@/lib/i18n/server'
import { getAdminData } from '@/lib/queries/admin'
import { getAssignablePeople } from '@/lib/queries/people'
import { resolveRange } from '@/lib/queries/range'
import { AdminTables } from './admin-tables'

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireUser()
  if (!can(user, 'manage:users')) redirect('/')

  const db = await getDb()
  const t = await getT()
  const selection = await resolveRange(db, await searchParams)
  const [vm, people] = await Promise.all([getAdminData(db), getAssignablePeople(db)])

  return (
    <>
      <Topbar overline={t('adminTitle')} title={t('adminTitle')} selection={selection} />
      <main className={shell.content}>
        <AdminTables vm={vm} currentUserId={user.id} people={people} />
      </main>
    </>
  )
}
