import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

// Self-hosted by Next at build time, so the app has no runtime dependency on
// Google Fonts. Weights match design.md §3.
const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'Nove PYS — Performans Yönetim Sistemi',
  description: 'Nove Group OKR ve hedef yönetimi',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={inter.variable}>
      <body>{children}</body>
    </html>
  )
}
