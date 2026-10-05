'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Avatar } from '@/components/ui/Avatar'
import type { SessionUser } from '@/lib/auth/permissions'
import { ROLE_KEY, tx } from '@/lib/i18n/strings'
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
  /** Key Results (under Yönetim) is oversight: Yönetici and Üst Yönetim. */
  canViewKeyResults?: boolean
}

export function Sidebar({
  user,
  data,
  canCreate,
  canManage,
  canEnterMonthly,
  canViewKeyResults = false,
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
    // Prefix match so sub-pages light their section — except /yonetim, whose
    // sub-page Key Results has its own entry and must not light both.
    const active =
      href === '/' ? pathname === '/'
      : href === '/yonetim' ? pathname === '/yonetim'
      : pathname.startsWith(href)
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
    <nav className={styles.sidebar} aria-label={t('mainNav')}>
      <div className={styles.brand}>
        <Image className={styles.mark} src="/nove-logo.png" alt="Nove" width={32} height={32} priority />
        <div>
          <div className={styles.brandName}>Nove PYS.</div>
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
        {/* The welcome screen is full-bleed and has no date range, so this is a
            plain link rather than item(): no range to carry, never "active". */}
        <Link href="/hosgeldin" className={styles.item}>
          <span className={styles.itemLabel}>{t('navHome')}</span>
        </Link>
        {item('/', t('overview'))}
        {item('/rapor', t('report'))}
        {canEnterMonthly ? item('/veri-girisi', t('navMonthlyEntry')) : null}
        {canManage ? item('/yonetim', t('admin')) : null}
        {canViewKeyResults ? item('/yonetim/key-results', t('navKeyResults')) : null}
        {item('/yardim', t('userGuide'))}
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
          <div className={styles.footerRole}>{t(ROLE_KEY[user.role])}</div>
        </div>
        <form action={signOutAction}>
          <button type="submit" className={styles.signOut}>{t('signOut')}</button>
        </form>
      </div>
    </nav>
  )
}
