import type { Metadata } from 'next'
import { Inter, Inter_Tight } from 'next/font/google'
import { getLang } from '@/lib/i18n/server'
import './globals.css'

// Self-hosted by Next at build time, so the app has no runtime dependency on
// Google Fonts. Weights match design.md §3.
const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-inter',
})

// The "Parşömen" face (design.md §5): the sign-in and welcome screens and the
// sidebar wordmark. The rest of the app moves to it with the token switch.
const interTight = Inter_Tight({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-tight',
})

export async function generateMetadata(): Promise<Metadata> {
  return (await getLang()) === 'en'
    ? { title: 'Nove PYS — Performance Management System', description: 'Nove Group OKR and goal management' }
    : { title: 'Nove PYS — Performans Yönetim Sistemi', description: 'Nove Group OKR ve hedef yönetimi' }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Server-rendered from the cookie so the first paint already has the right
  // case rules; PrefsProvider keeps it in step afterwards.
  const lang = await getLang()
  return (
    <html lang={lang} className={`${inter.variable} ${interTight.variable}`}>
      <body>{children}</body>
    </html>
  )
}
