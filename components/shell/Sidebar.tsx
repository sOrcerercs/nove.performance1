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
  canCreate: boolean
  canManage: boolean
  /** Whether the signed-in user may edit at least one key result's monthly
   * values. A blanket capability check for the nav link only — the entry
   * screen itself still renders a mixed table (some rows read-only) and the
   * server still re-checks every row on save regardless of this flag. */
  canEnterMonthly: boolean
}

const ROLE_LABEL: Record<SessionUser['role'], string> = {
  admin: 'Yönetici',
  executive: 'Üst Yönetim',
  staff: 'Personel',
}

export function Sidebar({
  user,
  data,
  canCreate,
  canManage,
  canEnterMonthly,
}: Props) {
  const { t, lang } = usePrefs()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Carry the selected range across navigation so switching screens does not
  // silently drop the user back to the default.
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const withRange = (href: string) =>
    from && to ? `${href}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}` : href

  // The range is resolved once, server-side, from the same header the layout
  // reads — the client no longer has to mirror `readRange` to agree with it.
  const pctOf = (slug: string) => data.pctBySlug[slug] ?? 0

  const item = (href: string, label: string, extra?: React.ReactNode) => {
    const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
    return (
      <Link
        key={href}
        href={withRange(href)}
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
        <Link href={withRange('/yeni')} className={styles.newButton}>
          + {t('newObjective')}
        </Link>
      ) : null}

      <div className={styles.group}>
        <div className={styles.groupTitle}>{t('navGroupMain')}</div>
        {item('/', t('overview'))}
        {item('/rapor', t('report'))}
        {canEnterMonthly ? item('/veri-girisi', t('navMonthlyEntry')) : null}
        {canManage ? item('/yonetim', t('admin')) : null}
        {item('/yardim', 'Kullanım kılavuzu')}
      </div>

      <div className={styles.group}>
        <div className={styles.groupTitle}>{t('navGroupDepts')}</div>
        {data.depts.map((d) =>
          item(
            `/bolum/${d.slug}`,
            `${d.emoji}  ${tx({ tr: d.nameTr, en: d.nameEn }, lang)}`,
            <span className={styles.itemPct}>{pctOf(d.slug)}%</span>,
          ),
        )}
      </div>

      <div className={styles.sidebarFooter}>
        <Avatar name={user.name} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link href={withRange('/hesap')} className={styles.footerName}>
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
