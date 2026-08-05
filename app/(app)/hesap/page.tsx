import { Topbar } from '@/components/shell/Topbar'
import shell from '@/components/shell/shell.module.css'
import { requireUser } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { periodParam, resolvePeriod } from '@/lib/queries/periods'
import { AccountForm } from './account-form'

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireUser()
  const db = await getDb()
  const selection = await resolvePeriod(db, periodParam(await searchParams))

  return (
    <>
      <Topbar
        overline="Hesabım"
        title="Hesabım"
        periods={selection?.all ?? []}
        activePeriod={selection?.current.code ?? ''}
      />
      <main className={shell.content}>
        <AccountForm name={user.name} email={user.email} role={user.role} />
      </main>
    </>
  )
}
