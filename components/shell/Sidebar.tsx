'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Avatar } from '@/components/ui/Avatar'
import type { SessionUser } from '@/lib/auth/permissions'
import { tx } from '@/lib/i18n/strings'
import { usePrefs } from '@/lib/prefs/PrefsProvider'
import type { SidebarData } from '@/lib/queries/sidebar'
import { signOutAction } from './actions'
import styles from './shell.module.css'

interface Props {
  user: SessionUser
  data: SidebarData
  defaultPeriod: string
  canCreate: boolean
  canManage: boolean
}

const ROLE_LABEL: Record<SessionUser['role'], string> = {
  admin: 'Yönetici',
  executive: 'Üst Yönetim',
  staff: 'Personel',
}

export function Sidebar({ user, data, defaultPeriod, canCreate, canManage }: Props) {
  const { t, lang } = usePrefs()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Carry the selected period across navigation so switching screens does not
  // silently drop the user back to the active quarter.
  const period = searchParams.get('period')
  const withPeriod = (href: string) => (period ? `${href}?period=${encodeURIComponent(period)}` : href)

  // The layout cannot see searchParams, so it hands over every period's numbers
  // and the sidebar picks the one the page is actually showing.
  const activePeriod = period ?? defaultPeriod
  const pcts = data.pctByPeriod[activePeriod] ?? {}

  const item = (href: string, label: string, extra?: React.ReactNode) => {
    const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
    return (
      <Link
        key={href}
        href={withPeriod(href)}
        className={`${styles.item} ${active ? styles.itemActive : ''}`}
        aria-current={active ? 'page' : undefined}
      >
        <span className={styles.itemLabel}>{label}</span>
        {extra}
      </Link>
    )
  }

  return (
    <nav className={styles.sidebar} aria-label="Ana gezinme">
      <div className={styles.brand}>
        <div className={styles.mark}>N</div>
        <div>
          <div className={styles.brandName}>Nove PYS</div>
          <div className={styles.brandSub}>{t('brandSub')}</div>
        </div>
      </div>

      {canCreate ? (
        <Link href={withPeriod('/yeni')} className={styles.newButton}>
          + {t('newObjective')}
        </Link>
      ) : null}

      <div className={styles.group}>
        <div className={styles.groupTitle}>{t('navGroupMain')}</div>
        {item('/', t('overview'))}
        {item('/rapor', t('report'))}
        {canManage ? item('/yonetim', t('admin')) : null}
        {item('/yardim', 'Kullanım kılavuzu')}
      </div>

      <div className={styles.group}>
        <div className={styles.groupTitle}>{t('navGroupDepts')}</div>
        {data.depts.map((d) =>
          item(
            `/bolum/${d.slug}`,
            `${d.emoji}  ${tx({ tr: d.nameTr, en: d.nameEn }, lang)}`,
            <span className={styles.itemPct}>{pcts[d.slug] ?? 0}%</span>,
          ),
        )}
      </div>

      <div className={styles.sidebarFooter}>
        <Avatar name={user.name} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link href={withPeriod('/hesap')} className={styles.footerName}>
            {user.name}
          </Link>
          <div className={styles.footerRole}>{ROLE_LABEL[user.role]}</div>
        </div>
        <form action={signOutAction}>
          <button type="submit" className={styles.signOut}>Çıkış</button>
        </form>
      </div>
    </nav>
  )
}
