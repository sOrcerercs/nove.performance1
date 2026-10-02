import type { Metadata } from 'next'
import { Inter, Inter_Tight } from 'next/font/google'
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

export const metadata: Metadata = {
  title: 'Nove PYS — Performans Yönetim Sistemi',
  description: 'Nove Group OKR ve hedef yönetimi',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={`${inter.variable} ${interTight.variable}`}>
      <body>{children}</body>
    </html>
  )
}
