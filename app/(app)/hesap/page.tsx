import { Topbar } from '@/components/shell/Topbar'
import shell from '@/components/shell/shell.module.css'
import { requireUser } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { resolveRange } from '@/lib/queries/range'
import { AccountForm } from './account-form'

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireUser()
  const db = await getDb()
  const selection = await resolveRange(db, await searchParams)

  return (
    <>
      <Topbar overline="Hesabım" title="Hesabım" selection={selection} />
      <main className={shell.content}>
        <AccountForm name={user.name} email={user.email} role={user.role} />
      </main>
    </>
  )
}
