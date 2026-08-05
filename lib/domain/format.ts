import type { Lang } from './types'

const LOCALE: Record<Lang, string> = { tr: 'tr-TR', en: 'en-US' }

/**
 * Number formatting, ported from the prototype's `fmt`.
 *
 * Fractional values get exactly one decimal with the locale's separator;
 * integers of 1000 or more get locale grouping; anything else prints bare.
 * Missing or non-numeric values render as an em dash rather than "NaN".
 */
export function formatNumber(n: number | null | undefined, lang: Lang): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'

  if (!Number.isInteger(n)) {
    return n.toFixed(1).replace('.', lang === 'tr' ? ',' : '.')
  }
  if (Math.abs(n) >= 1000) return n.toLocaleString(LOCALE[lang])
  return String(n)
}

/** A measurement with its unit. Percent hugs the number; every other unit gets a space. */
export function formatValue(n: number, unit: string, lang: Lang): string {
  const num = formatNumber(n, lang)
  if (!unit) return num
  return unit === '%' ? `${num}%` : `${num} ${unit}`
}

/** Avatar initials: first letters of the first two words, ignoring a "Dr." title. */
export function initials(name: string): string {
  return String(name)
    .replace('Dr. ', '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()
}
