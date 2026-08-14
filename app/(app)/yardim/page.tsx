import { HelpClient } from '@/components/help/HelpClient'
import { Topbar } from '@/components/shell/Topbar'
import shell from '@/components/shell/shell.module.css'
import { can } from '@/lib/auth/permissions'
import { requireUser } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { getHelpArticles } from '@/lib/queries/help'
import { resolveRange } from '@/lib/queries/range'

export default async function HelpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireUser()
  const db = await getDb()

  const [selection, articles] = await Promise.all([
    resolveRange(db, await searchParams),
    getHelpArticles(db),
  ])

  return (
    <>
      <Topbar overline="Yardım" title="Kullanım kılavuzu" selection={selection} />
      <main className={shell.content}>
        <HelpClient articles={articles} canManage={can(user, 'manage:help')} />
      </main>
    </>
  )
}
