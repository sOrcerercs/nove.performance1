import { HelpClient } from '@/components/help/HelpClient'
import { Topbar } from '@/components/shell/Topbar'
import shell from '@/components/shell/shell.module.css'
import { can } from '@/lib/auth/permissions'
import { requireUser } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { getHelpArticles } from '@/lib/queries/help'
import { periodParam, resolvePeriod } from '@/lib/queries/periods'

export default async function HelpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireUser()
  const db = await getDb()

  const [selection, articles] = await Promise.all([
    resolvePeriod(db, periodParam(await searchParams)),
    getHelpArticles(db),
  ])

  return (
    <>
      <Topbar
        overline="Yardım"
        title="Kullanım kılavuzu"
        periods={selection?.all ?? []}
        activePeriod={selection?.current.code ?? ''}
      />
      <main className={shell.content}>
        <HelpClient articles={articles} canManage={can(user, 'manage:help')} />
      </main>
    </>
  )
}
